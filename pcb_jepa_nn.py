"""
PCBWorkspace JEPA Neural Network
=================================
Joint Embedding Predictive Architecture for PCB Pick-and-Place Vision

Architecture Overview:
  ┌─────────────────────────────────────────────────────────┐
  │                   PCBWorkspaceJEPA                      │
  │                                                         │
  │  Top Camera ──► ContextEncoder ──► sx                   │
  │                                     │                   │
  │  Bottom Camera ─► TargetEncoder ──► sy (EMA weights)    │
  │                                     │                   │
  │                 Predictor(sx, z) ──► ŝy                 │
  │                                     │                   │
  │               JEPA Loss = ||ŝy - sg(sy)||²              │
  │                                                         │
  │  Downstream Heads:                                      │
  │    - ComponentDetector  (top cam → fiducial/part bbox)  │
  │    - AlignmentCorrector (bottom cam → Δθ, Δx, Δy)      │
  │    - PlacementValidator (both cams → pass/fail)         │
  └─────────────────────────────────────────────────────────┘

Design Decisions:
  - JEPA backbone for self-supervised pretraining (no labels needed)
  - EMA target encoder prevents representational collapse
  - Variance + covariance regularization (VICReg-style) as backup
  - Lightweight ViT-style patch embeddings (works on 720p USB cams)
  - Separate downstream heads trained with labeled data on top of
    frozen JEPA backbone → minimal labeled data requirement
  - NumPy reference implementation + PyTorch production implementation

Files produced by this module:
  pcb_jepa_nn.py          ← this file (full implementation)
  train_jepa.py           ← pretraining script
  train_downstream.py     ← downstream head training
  infer.py                ← real-time inference for OpenPnP integration

Author: PCBWorkspace SERC Team
"""

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 0 — IMPORTS & CONFIGURATION
# ─────────────────────────────────────────────────────────────────────────────

import math
import copy
import numpy as np
from dataclasses import dataclass, field
from typing import Optional, Tuple, List, Dict

# ── Try importing PyTorch; fall back to numpy-only mode ──────────────────────
try:
    import torch
    import torch.nn as nn
    import torch.nn.functional as F
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False
    print("[PCB-JEPA] PyTorch not found — running NumPy reference mode.")
    print("           Install with: pip install torch torchvision")


@dataclass
class JEPAConfig:
    """All hyperparameters in one place — easy to tune."""

    # ── Image / Patch Settings ────────────────────────────────────────────────
    img_h: int = 480          # camera frame height (720p → crop to 480 for speed)
    img_w: int = 640          # camera frame width
    patch_size: int = 16      # ViT-style patches (16×16 pixels each)
    in_channels: int = 3      # RGB

    # ── Encoder Architecture ─────────────────────────────────────────────────
    embed_dim: int = 256       # patch embedding dimension
    encoder_depth: int = 6     # transformer blocks in context encoder
    encoder_heads: int = 8     # multi-head attention heads
    encoder_mlp_ratio: float = 4.0
    dropout: float = 0.1

    # ── Predictor Architecture ────────────────────────────────────────────────
    predictor_depth: int = 4   # narrower than encoder (latent predictor)
    predictor_dim: int = 128   # predictor hidden dim (bottleneck)

    # ── JEPA Masking Strategy ─────────────────────────────────────────────────
    # For PCB: mask 40-60% of target patches (component regions tend to be
    # spatially clustered, so large mask blocks force semantic prediction)
    num_target_blocks: int = 4       # number of target regions to predict
    target_mask_scale: Tuple = (0.15, 0.30)  # fraction of image per block
    target_aspect_ratio: Tuple = (0.75, 1.5)
    context_mask_ratio: float = 0.0  # context encoder sees full image

    # ── EMA (Exponential Moving Average) for target encoder ──────────────────
    ema_momentum_start: float = 0.996
    ema_momentum_end: float = 1.000
    ema_warmup_epochs: int = 40

    # ── Training ─────────────────────────────────────────────────────────────
    batch_size: int = 32
    learning_rate: float = 1.5e-4
    weight_decay: float = 0.05
    warmup_epochs: int = 10
    total_epochs: int = 200
    grad_clip: float = 1.0

    # ── VICReg regularization (prevents collapse) ─────────────────────────────
    vicreg_lambda: float = 25.0   # invariance loss weight
    vicreg_mu: float = 25.0       # variance loss weight
    vicreg_nu: float = 1.0        # covariance loss weight

    # ── Downstream Tasks ─────────────────────────────────────────────────────
    num_component_classes: int = 20   # e.g. 0402, 0603, 0805, SOT-23, QFP...
    alignment_output_dim: int = 3     # [Δθ (degrees), Δx (mm), Δy (mm)]
    placement_classes: int = 2        # pass / fail

    # ── Derived (auto-computed) ───────────────────────────────────────────────
    @property
    def num_patches(self) -> int:
        return (self.img_h // self.patch_size) * (self.img_w // self.patch_size)

    @property
    def seq_len(self) -> int:
        return self.num_patches + 1  # +1 for CLS token


# ─────────────────────────────────────────────────────────────────────────────
# SECTION 1 — NUMPY REFERENCE IMPLEMENTATION
# (Pure-math version for understanding / environments without PyTorch)
# ─────────────────────────────────────────────────────────────────────────────

class NumpyJEPA:
    """
    Simplified NumPy implementation of the JEPA forward pass.
    Useful for understanding the math and for environments without PyTorch.
    Not meant for training (no autograd) — use PyTorch version for that.
    """

    def __init__(self, cfg: JEPAConfig):
        self.cfg = cfg
        np.random.seed(42)
        D = cfg.embed_dim

        # Patch projection weights
        patch_in = cfg.in_channels * cfg.patch_size * cfg.patch_size
        self.patch_proj_W = np.random.randn(patch_in, D) * 0.02
        self.patch_proj_b = np.zeros(D)

        # Positional embeddings (sinusoidal)
        self.pos_embed = self._sinusoidal_pos_embed(cfg.num_patches + 1, D)

        # CLS token
        self.cls_token = np.zeros((1, D))

        # Predictor projection (context → predictor dim)
        self.pred_proj_W = np.random.randn(D, cfg.predictor_dim) * 0.02
        self.pred_proj_b = np.zeros(cfg.predictor_dim)

        # Predictor output projection (predictor dim → embed dim)
        self.pred_out_W = np.random.randn(cfg.predictor_dim, D) * 0.02
        self.pred_out_b = np.zeros(D)

    @staticmethod
    def _sinusoidal_pos_embed(n_positions: int, d_model: int) -> np.ndarray:
        """Standard sinusoidal positional encoding."""
        PE = np.zeros((n_positions, d_model))
        pos = np.arange(n_positions)[:, np.newaxis]
        div = np.exp(np.arange(0, d_model, 2) * (-math.log(10000.0) / d_model))
        PE[:, 0::2] = np.sin(pos * div)
        PE[:, 1::2] = np.cos(pos * div)
        return PE

    @staticmethod
    def _layer_norm(x: np.ndarray, eps: float = 1e-6) -> np.ndarray:
        mean = x.mean(axis=-1, keepdims=True)
        std = x.std(axis=-1, keepdims=True)
        return (x - mean) / (std + eps)

    @staticmethod
    def _softmax(x: np.ndarray) -> np.ndarray:
        x = x - x.max(axis=-1, keepdims=True)
        e = np.exp(x)
        return e / e.sum(axis=-1, keepdims=True)

    def _self_attention(self, x: np.ndarray, W_q, W_k, W_v, W_o,
                        n_heads: int) -> np.ndarray:
        """Simplified single-layer multi-head self-attention."""
        B, T, D = x.shape
        d_head = D // n_heads

        Q = x @ W_q  # (B, T, D)
        K = x @ W_k
        V = x @ W_v

        # Reshape to heads
        Q = Q.reshape(B, T, n_heads, d_head).transpose(0, 2, 1, 3)
        K = K.reshape(B, T, n_heads, d_head).transpose(0, 2, 1, 3)
        V = V.reshape(B, T, n_heads, d_head).transpose(0, 2, 1, 3)

        scale = math.sqrt(d_head)
        attn = self._softmax((Q @ K.transpose(0, 1, 3, 2)) / scale)
        out = (attn @ V).transpose(0, 2, 1, 3).reshape(B, T, D)
        return out @ W_o

    def patchify(self, img: np.ndarray) -> np.ndarray:
        """
        img: (B, H, W, C) uint8 or float32
        returns: (B, N, patch_in) where N = num_patches
        """
        B, H, W, C = img.shape
        P = self.cfg.patch_size
        img = img.astype(np.float32) / 255.0  # normalize

        nH = H // P
        nW = W // P
        patches = img[:, :nH*P, :nW*P, :]\
                    .reshape(B, nH, P, nW, P, C)\
                    .transpose(0, 1, 3, 2, 4, 5)\
                    .reshape(B, nH*nW, P*P*C)
        return patches

    def embed_patches(self, patches: np.ndarray) -> np.ndarray:
        """
        patches: (B, N, patch_in)
        returns: (B, N+1, embed_dim) with CLS prepended and pos encoding added
        """
        B, N, _ = patches.shape
        # Linear projection
        x = patches @ self.patch_proj_W + self.patch_proj_b  # (B, N, D)
        # Prepend CLS
        cls = np.tile(self.cls_token[np.newaxis], (B, 1, 1))  # (B,1,D)
        x = np.concatenate([cls, x], axis=1)                  # (B,N+1,D)
        # Add positional encoding
        x = x + self.pos_embed[:N+1]
        return x

    def forward_context(self, img: np.ndarray) -> np.ndarray:
        """
        Encode the full context image (top or bottom camera frame).
        img: (B, H, W, C)
        returns: (B, N+1, embed_dim) — full sequence of patch embeddings
        """
        patches = self.patchify(img)
        x = self.embed_patches(patches)
        x = self._layer_norm(x)
        # (Simplified: skip transformer blocks for numpy version)
        return x

    def forward_predictor(self, sx: np.ndarray,
                          target_mask_indices: np.ndarray) -> np.ndarray:
        """
        Predict target embeddings from context embedding.
        sx: (B, N+1, D) — context encoder output
        target_mask_indices: (num_targets,) — which patch indices to predict
        returns: (B, num_targets, D) — predicted target embeddings
        """
        # Pool context to get global representation
        ctx = sx.mean(axis=1)  # (B, D)

        # Project to predictor dim
        h = self._layer_norm(ctx @ self.pred_proj_W + self.pred_proj_b)
        h = np.maximum(0, h)  # ReLU

        # Project back to embed dim for each target patch
        num_targets = len(target_mask_indices)
        # Expand for each target position
        h_expanded = np.tile(h[:, np.newaxis, :], (1, num_targets, 1))
        pred = h_expanded @ self.pred_out_W + self.pred_out_b
        return pred

    def jepa_loss(self, pred: np.ndarray, target: np.ndarray) -> float:
        """
        Smooth L1 loss between predicted and actual target embeddings.
        pred:   (B, num_targets, D)
        target: (B, num_targets, D)
        """
        diff = pred - target
        loss = np.where(np.abs(diff) < 1.0,
                        0.5 * diff**2,
                        np.abs(diff) - 0.5)
        return float(loss.mean())

    def demo_forward(self, batch_size: int = 2) -> Dict:
        """Run a demo forward pass with random data."""
        cfg = self.cfg
        H, W, C = cfg.img_h, cfg.img_w, cfg.in_channels

        # Fake camera frames
        top_cam = np.random.randint(0, 255, (batch_size, H, W, C), dtype=np.uint8)
        bot_cam = np.random.randint(0, 255, (batch_size, H, W, C), dtype=np.uint8)

        # Encode both cameras
        sx = self.forward_context(top_cam)     # context (top cam)
        sy = self.forward_context(bot_cam)     # target  (bottom cam, EMA in real training)

        # Random target mask
        target_idx = np.random.choice(cfg.num_patches, size=cfg.num_target_blocks * 4,
                                      replace=False)

        # Predict
        pred = self.forward_predictor(sx, target_idx)
        sy_target = sy[:, 1:, :][: , target_idx, :]  # skip CLS

        loss = self.jepa_loss(pred, sy_target)

        return {
            "context_embedding_shape": sx.shape,
            "target_embedding_shape":  sy.shape,
            "prediction_shape":        pred.shape,
            "jepa_loss":               loss,
        }


# ─────────────────────────────────────────────────────────────────────────────
# SECTION 2 — PYTORCH PRODUCTION IMPLEMENTATION
# ─────────────────────────────────────────────────────────────────────────────

if TORCH_AVAILABLE:

    # ── 2a. Patch Embedding ───────────────────────────────────────────────────

    class PatchEmbed(nn.Module):
        """
        Convert (B, C, H, W) image into (B, N, embed_dim) patch tokens.
        Identical in spirit to ViT patch embedding.
        """
        def __init__(self, cfg: JEPAConfig):
            super().__init__()
            self.cfg = cfg
            self.proj = nn.Conv2d(
                cfg.in_channels,
                cfg.embed_dim,
                kernel_size=cfg.patch_size,
                stride=cfg.patch_size
            )
            self.norm = nn.LayerNorm(cfg.embed_dim)

        def forward(self, x: "torch.Tensor") -> "torch.Tensor":
            # x: (B, C, H, W)
            x = self.proj(x)                       # (B, D, H/P, W/P)
            x = x.flatten(2).transpose(1, 2)       # (B, N, D)
            return self.norm(x)

    # ── 2b. Sinusoidal Positional Encoding ────────────────────────────────────

    class SinusoidalPosEmbed(nn.Module):
        def __init__(self, n_positions: int, d_model: int):
            super().__init__()
            pe = torch.zeros(n_positions, d_model)
            pos = torch.arange(n_positions).unsqueeze(1).float()
            div = torch.exp(
                torch.arange(0, d_model, 2).float() * (-math.log(10000.0) / d_model)
            )
            pe[:, 0::2] = torch.sin(pos * div)
            pe[:, 1::2] = torch.cos(pos * div)
            self.register_buffer("pe", pe.unsqueeze(0))  # (1, N, D)

        def forward(self, x: "torch.Tensor") -> "torch.Tensor":
            return x + self.pe[:, :x.size(1)]

    # ── 2c. Transformer Block ─────────────────────────────────────────────────

    class TransformerBlock(nn.Module):
        """Standard pre-norm transformer block with GELU activation."""
        def __init__(self, dim: int, n_heads: int, mlp_ratio: float,
                     dropout: float = 0.0):
            super().__init__()
            self.norm1 = nn.LayerNorm(dim)
            self.attn  = nn.MultiheadAttention(dim, n_heads,
                                               dropout=dropout,
                                               batch_first=True)
            self.norm2 = nn.LayerNorm(dim)
            mlp_dim = int(dim * mlp_ratio)
            self.mlp = nn.Sequential(
                nn.Linear(dim, mlp_dim),
                nn.GELU(),
                nn.Dropout(dropout),
                nn.Linear(mlp_dim, dim),
                nn.Dropout(dropout),
            )

        def forward(self, x: "torch.Tensor") -> "torch.Tensor":
            # Self-attention with residual
            normed = self.norm1(x)
            attn_out, _ = self.attn(normed, normed, normed)
            x = x + attn_out
            # MLP with residual
            x = x + self.mlp(self.norm2(x))
            return x

    # ── 2d. Vision Encoder (Context Encoder & Target Encoder share this class) ─

    class VisionEncoder(nn.Module):
        """
        ViT-style encoder used for both context and target encoding.
        Context encoder: trained normally via gradient descent.
        Target encoder: updated via EMA of context encoder weights.

        For PCB application:
          - context encoder processes the full camera frame
          - target encoder (EMA copy) encodes target patch regions
          - This asymmetry is what prevents representational collapse
            without needing negative pairs (unlike contrastive learning)
        """
        def __init__(self, cfg: JEPAConfig):
            super().__init__()
            self.cfg = cfg

            # Patch embedding
            self.patch_embed = PatchEmbed(cfg)

            # CLS token
            self.cls_token = nn.Parameter(torch.zeros(1, 1, cfg.embed_dim))
            nn.init.trunc_normal_(self.cls_token, std=0.02)

            # Positional encoding
            self.pos_embed = SinusoidalPosEmbed(cfg.num_patches + 1, cfg.embed_dim)

            # Transformer blocks
            self.blocks = nn.ModuleList([
                TransformerBlock(cfg.embed_dim, cfg.encoder_heads,
                                 cfg.encoder_mlp_ratio, cfg.dropout)
                for _ in range(cfg.encoder_depth)
            ])

            self.norm = nn.LayerNorm(cfg.embed_dim)
            self.dropout = nn.Dropout(cfg.dropout)

        def forward(self, x: "torch.Tensor",
                    mask_indices: Optional["torch.Tensor"] = None
                    ) -> "torch.Tensor":
            """
            x: (B, C, H, W) — camera frame
            mask_indices: optional (M,) long tensor — patch indices to KEEP
                          (None = keep all patches, i.e. context encoder)
            returns: (B, T, D) where T = num kept patches + 1 (CLS)
            """
            B = x.size(0)

            # Embed patches
            tokens = self.patch_embed(x)            # (B, N, D)

            # Apply masking for target encoder (keep only target patches)
            if mask_indices is not None:
                tokens = tokens[:, mask_indices, :]  # (B, M, D)

            # Prepend CLS token
            cls = self.cls_token.expand(B, -1, -1)  # (B, 1, D)
            tokens = torch.cat([cls, tokens], dim=1) # (B, M+1, D)

            # Positional encoding + dropout
            tokens = self.pos_embed(tokens)
            tokens = self.dropout(tokens)

            # Transformer forward pass
            for blk in self.blocks:
                tokens = blk(tokens)

            return self.norm(tokens)                 # (B, M+1, D)

        def get_cls_embedding(self, x: "torch.Tensor") -> "torch.Tensor":
            """Return only the CLS token embedding — global frame representation."""
            return self.forward(x)[:, 0]             # (B, D)

    # ── 2e. JEPA Predictor ────────────────────────────────────────────────────

    class JEPAPredictor(nn.Module):
        """
        Takes the context encoder output and predicts target patch embeddings.

        Key design: the predictor is intentionally NARROWER than the encoder
        (predictor_dim < embed_dim). This bottleneck forces the predictor to
        learn a compressed world model rather than memorizing patch positions.

        The predictor is also conditioned on target patch position tokens (z),
        which tells it WHICH patches to predict — like "predict what's at
        position (row=3, col=5)" given the rest of the image context.
        """
        def __init__(self, cfg: JEPAConfig):
            super().__init__()
            self.cfg = cfg
            D = cfg.embed_dim
            Dp = cfg.predictor_dim

            # Project context to predictor dim
            self.input_proj = nn.Linear(D, Dp)

            # Positional token embeddings for target positions
            # These are the "z" variables in JEPA — which targets to predict
            self.target_pos_embed = nn.Embedding(cfg.num_patches, Dp)

            # Predictor transformer blocks (narrower than encoder)
            self.blocks = nn.ModuleList([
                TransformerBlock(Dp, max(1, cfg.encoder_heads // 2),
                                 cfg.encoder_mlp_ratio, cfg.dropout)
                for _ in range(cfg.predictor_depth)
            ])

            self.norm = nn.LayerNorm(Dp)

            # Project back to encoder embedding dim for loss computation
            self.output_proj = nn.Linear(Dp, D)

        def forward(self, sx: "torch.Tensor",
                    target_indices: "torch.Tensor") -> "torch.Tensor":
            """
            sx: (B, N+1, D) — full context encoder output
            target_indices: (M,) — patch position indices to predict
            returns: (B, M, D) — predicted embeddings for target patches
            """
            B = sx.size(0)
            M = target_indices.size(0)

            # Project context sequence to predictor dim
            h = self.input_proj(sx)    # (B, N+1, Dp)

            # Create target position tokens (the "z" in JEPA)
            z = self.target_pos_embed(target_indices)            # (M, Dp)
            z = z.unsqueeze(0).expand(B, -1, -1)                # (B, M, Dp)

            # Concatenate context + target position queries
            h = torch.cat([h, z], dim=1)   # (B, N+1+M, Dp)

            # Run predictor transformer
            for blk in self.blocks:
                h = blk(h)
            h = self.norm(h)

            # Extract only the target-position outputs (last M tokens)
            h_targets = h[:, -M:, :]       # (B, M, Dp)

            # Project back to encoder dim
            return self.output_proj(h_targets)  # (B, M, D)

    # ── 2f. PCBWorkspace JEPA — Main Model ───────────────────────────────────

    class PCBWorkspaceJEPA(nn.Module):
        """
        Full JEPA model for PCB pick-and-place.

        Training phases:
          Phase 1 — Self-supervised JEPA pretraining (no labels)
            Run on any PCB camera footage. The model learns:
              • what PCB board structure looks like
              • spatial relationships between components
              • temporal continuity between frames (bottom camera)

          Phase 2 — Downstream head finetuning (with labels)
            Freeze JEPA backbone, train lightweight heads:
              • ComponentDetector  — classify + locate components
              • AlignmentCorrector — predict placement correction
              • PlacementValidator — pass/fail quality check
        """

        def __init__(self, cfg: JEPAConfig):
            super().__init__()
            self.cfg = cfg

            # ── Context encoder (trained via backprop) ────────────────────────
            self.context_encoder = VisionEncoder(cfg)

            # ── Target encoder (updated via EMA only — no gradients) ─────────
            self.target_encoder = copy.deepcopy(self.context_encoder)
            for p in self.target_encoder.parameters():
                p.requires_grad = False     # target encoder: NO gradients

            # ── Predictor ─────────────────────────────────────────────────────
            self.predictor = JEPAPredictor(cfg)

            # ── EMA momentum (annealed during training) ───────────────────────
            self.ema_momentum = cfg.ema_momentum_start

        @torch.no_grad()
        def update_target_encoder(self, momentum: float):
            """
            EMA update: θ_target = m * θ_target + (1-m) * θ_context
            This is the key mechanism preventing representational collapse.
            Called after every optimizer step.
            """
            for ctx_p, tgt_p in zip(self.context_encoder.parameters(),
                                    self.target_encoder.parameters()):
                tgt_p.data = momentum * tgt_p.data + (1.0 - momentum) * ctx_p.data

        def generate_jepa_masks(self, device: "torch.device"
                                ) -> Tuple["torch.Tensor", "torch.Tensor"]:
            """
            Generate target mask indices using block masking strategy.
            
            For PCB images, we use block masks because:
              - Component pads are spatially clustered
              - Predicting entire component regions forces semantic understanding
              - Random pixel masking would be too easy (adjacent patches are similar)

            Returns:
              target_indices: (M,)  — patch indices the predictor must reconstruct
              context_indices: (K,) — remaining patches fed to context encoder
                                      (currently all patches in context)
            """
            cfg = self.cfg
            N = cfg.num_patches
            nW = cfg.img_w // cfg.patch_size
            nH = cfg.img_h // cfg.patch_size

            masked = set()

            for _ in range(cfg.num_target_blocks):
                # Sample block size
                scale = np.random.uniform(*cfg.target_mask_scale)
                ratio = np.random.uniform(*cfg.target_aspect_ratio)

                block_area = int(N * scale)
                block_h = int(math.sqrt(block_area / ratio))
                block_w = int(block_h * ratio)
                block_h = min(block_h, nH)
                block_w = min(block_w, nW)

                # Sample random top-left corner
                top  = np.random.randint(0, max(1, nH - block_h))
                left = np.random.randint(0, max(1, nW - block_w))

                for r in range(top, min(top + block_h, nH)):
                    for c in range(left, min(left + block_w, nW)):
                        masked.add(r * nW + c)

            target_indices = torch.tensor(sorted(masked), dtype=torch.long,
                                          device=device)
            # Context sees all patches (no context masking per config)
            all_indices = torch.arange(N, device=device)
            return target_indices, all_indices

        def forward(self, x_context: "torch.Tensor",
                    x_target: Optional["torch.Tensor"] = None
                    ) -> Dict[str, "torch.Tensor"]:
            """
            JEPA forward pass.

            x_context: (B, C, H, W) — top camera frame (or any frame)
            x_target:  (B, C, H, W) — optional different frame for target
                                       (e.g. bottom camera, or augmented version)
                                       If None, uses x_context (self-prediction)

            Returns dict with:
              "predictions"     — (B, M, D) predictor output
              "targets"         — (B, M, D) target encoder output (sg = stop-grad)
              "context_embed"   — (B, N+1, D) full context encoding
              "target_embed"    — (B, M+1, D) target encoding
              "target_indices"  — (M,) which patches were masked
            """
            if x_target is None:
                x_target = x_context

            device = x_context.device
            target_indices, _ = self.generate_jepa_masks(device)

            # ── Context encoder forward (with gradients) ──────────────────────
            sx = self.context_encoder(x_context)     # (B, N+1, D)

            # ── Target encoder forward (stop-gradient) ────────────────────────
            with torch.no_grad():
                sy = self.target_encoder(x_target, mask_indices=target_indices)
                # sy: (B, M+1, D) — only target patches + CLS

            # ── Predictor: predict target from context ────────────────────────
            pred = self.predictor(sx, target_indices)  # (B, M, D)

            # Target: skip CLS token (index 0)
            target_patches = sy[:, 1:, :]             # (B, M, D)

            return {
                "predictions":    pred,
                "targets":        target_patches,
                "context_embed":  sx,
                "target_embed":   sy,
                "target_indices": target_indices,
            }

    # ── 2g. JEPA Loss Function ────────────────────────────────────────────────

    class JEPALoss(nn.Module):
        """
        Combined loss for JEPA pretraining:
          L = L_JEPA + λ_v * L_variance + λ_c * L_covariance

        L_JEPA:      smooth L1 between predicted and target embeddings
        L_variance:  ensures embedding dimensions have non-zero variance
                     (prevents all embeddings from collapsing to zero)
        L_covariance: decorrelates embedding dimensions
                     (prevents redundant representations)

        This VICReg-style regularization on top of JEPA provides belt-and-
        suspenders collapse prevention — especially important early in training
        before EMA momentum stabilizes.
        """
        def __init__(self, cfg: JEPAConfig):
            super().__init__()
            self.cfg = cfg

        def forward(self, pred: "torch.Tensor",
                    target: "torch.Tensor") -> Dict[str, "torch.Tensor"]:
            """
            pred:   (B, M, D) — predictor output
            target: (B, M, D) — target encoder output (already stop-grad)
            """
            B, M, D = pred.shape

            # ── JEPA reconstruction loss (smooth L1) ──────────────────────────
            l_jepa = F.smooth_l1_loss(pred, target)

            # ── Flatten for regularization ─────────────────────────────────────
            z = pred.reshape(B * M, D)    # treat each patch pred as a sample
            t = target.reshape(B * M, D)

            # ── Variance loss ──────────────────────────────────────────────────
            # Each embedding dimension should have std > γ (γ=1)
            std_z = z.std(dim=0)   # (D,)
            std_t = t.std(dim=0)
            l_var = (F.relu(1.0 - std_z).mean() + F.relu(1.0 - std_t).mean()) / 2

            # ── Covariance loss ────────────────────────────────────────────────
            # Off-diagonal elements of covariance matrix should be near zero
            z_c = z - z.mean(dim=0)
            cov_z = (z_c.T @ z_c) / (B * M - 1)
            l_cov = (cov_z.fill_diagonal_(0) ** 2).sum() / D

            cfg = self.cfg
            total = (cfg.vicreg_lambda * l_jepa +
                     cfg.vicreg_mu    * l_var  +
                     cfg.vicreg_nu    * l_cov)

            return {
                "loss":       total,
                "l_jepa":     l_jepa,
                "l_variance": l_var,
                "l_covariance": l_cov,
            }

    # ─────────────────────────────────────────────────────────────────────────
    # SECTION 3 — DOWNSTREAM HEADS
    # ─────────────────────────────────────────────────────────────────────────

    class ComponentDetector(nn.Module):
        """
        Downstream head 1: Component Classification + Localization
        Input: CLS embedding from context encoder (top camera)
        Output: component class logits + bounding box regression

        This head answers: "What component is at this location and where
        exactly is it on the board?"

        Used in: Workflow Step 1 (top camera → coordinate map)
        """
        def __init__(self, cfg: JEPAConfig):
            super().__init__()
            D = cfg.embed_dim
            self.classifier = nn.Sequential(
                nn.Linear(D, D // 2),
                nn.GELU(),
                nn.Dropout(0.1),
                nn.Linear(D // 2, cfg.num_component_classes),
            )
            # Bounding box: [x_center, y_center, width, height] normalized 0-1
            self.bbox_regressor = nn.Sequential(
                nn.Linear(D, D // 2),
                nn.GELU(),
                nn.Dropout(0.1),
                nn.Linear(D // 2, 4),
                nn.Sigmoid(),    # constrain to [0, 1]
            )

        def forward(self, cls_embed: "torch.Tensor"
                    ) -> Tuple["torch.Tensor", "torch.Tensor"]:
            """
            cls_embed: (B, D) — CLS token from context encoder
            returns: (class_logits (B, num_classes), bbox (B, 4))
            """
            return self.classifier(cls_embed), self.bbox_regressor(cls_embed)

    class AlignmentCorrector(nn.Module):
        """
        Downstream head 2: Nozzle Alignment Correction
        Input: patch embeddings from bottom camera encoder
        Output: [Δθ, Δx, Δy] — rotation and translation correction

        This is the most precision-critical head. It tells the NEMA 8
        hollow shaft motor how many degrees to rotate and tells the
        arm controller how much to adjust XY before placement.

        Design: uses ALL patch embeddings (not just CLS) via mean pooling,
        because fine-grained spatial information matters for sub-mm accuracy.

        Used in: Workflow Step 4 (bottom camera → alignment correction)
        """
        def __init__(self, cfg: JEPAConfig):
            super().__init__()
            D = cfg.embed_dim
            out = cfg.alignment_output_dim   # [Δθ, Δx, Δy]

            self.pool = nn.Sequential(
                nn.LayerNorm(D),
            )
            self.head = nn.Sequential(
                nn.Linear(D, D),
                nn.GELU(),
                nn.Dropout(0.1),
                nn.Linear(D, D // 2),
                nn.GELU(),
                nn.Linear(D // 2, out),
            )
            # Output scaling: θ in [-180, 180] deg, x/y in [-5, 5] mm
            self.output_scale = nn.Parameter(
                torch.tensor([180.0, 5.0, 5.0]), requires_grad=False
            )

        def forward(self, patch_embed: "torch.Tensor") -> "torch.Tensor":
            """
            patch_embed: (B, N+1, D) — full encoder output including CLS
            returns: (B, 3) — [Δθ (deg), Δx (mm), Δy (mm)]
            """
            # Mean-pool all patch tokens (skip CLS at index 0)
            spatial = patch_embed[:, 1:, :].mean(dim=1)   # (B, D)
            spatial = self.pool(spatial)
            raw = self.head(spatial)                        # (B, 3)
            return torch.tanh(raw) * self.output_scale      # scaled output

    class PlacementValidator(nn.Module):
        """
        Downstream head 3: Placement Quality Validation
        Input: embeddings from BOTH top and bottom cameras (concatenated)
        Output: pass / fail binary classification

        Compares the expected component embedding (from top camera before
        pick) with the actual placement embedding (from top camera after
        place) to detect: missing components, tombstoning, misalignment,
        bridged pads, wrong components.

        Used in: Workflow Step 5 (post-placement verification)
        """
        def __init__(self, cfg: JEPAConfig):
            super().__init__()
            D = cfg.embed_dim

            # Cross-attention: bottom cam attends to top cam
            self.cross_attn = nn.MultiheadAttention(D, cfg.encoder_heads,
                                                    batch_first=True)
            self.norm = nn.LayerNorm(D)

            self.classifier = nn.Sequential(
                nn.Linear(D * 2, D),
                nn.GELU(),
                nn.Dropout(0.1),
                nn.Linear(D, cfg.placement_classes),
            )

        def forward(self, top_embed: "torch.Tensor",
                    bot_embed: "torch.Tensor") -> "torch.Tensor":
            """
            top_embed: (B, N+1, D) — top camera encoder output
            bot_embed: (B, N+1, D) — bottom camera encoder output
            returns:   (B, 2) — logits for [fail, pass]
            """
            # Cross-attend: top cam tokens attend to bottom cam tokens
            attended, _ = self.cross_attn(
                query=top_embed,
                key=bot_embed,
                value=bot_embed,
            )
            attended = self.norm(attended + top_embed)  # residual

            # Pool CLS tokens from both paths
            top_cls = top_embed[:, 0]       # (B, D)
            attn_cls = attended[:, 0]       # (B, D)

            combined = torch.cat([top_cls, attn_cls], dim=-1)  # (B, 2D)
            return self.classifier(combined)

    # ─────────────────────────────────────────────────────────────────────────
    # SECTION 4 — FULL SYSTEM (JEPA BACKBONE + ALL HEADS)
    # ─────────────────────────────────────────────────────────────────────────

    class PCBVisionSystem(nn.Module):
        """
        Complete vision system combining JEPA backbone with all downstream heads.

        Usage:
          Phase 1 — Pretraining:
            model = PCBVisionSystem(cfg)
            loss_dict = model.jepa_forward(top_frames, bot_frames)

          Phase 2 — Finetuning:
            model.freeze_backbone()
            # then train only heads

          Phase 3 — Inference:
            detections = model.detect_components(top_frame)
            correction = model.correct_alignment(bot_frame)
            valid      = model.validate_placement(top_pre, top_post)
        """
        def __init__(self, cfg: JEPAConfig):
            super().__init__()
            self.cfg = cfg

            # JEPA backbone
            self.jepa = PCBWorkspaceJEPA(cfg)
            self.jepa_loss_fn = JEPALoss(cfg)

            # Downstream heads
            self.component_detector   = ComponentDetector(cfg)
            self.alignment_corrector  = AlignmentCorrector(cfg)
            self.placement_validator  = PlacementValidator(cfg)

        def freeze_backbone(self):
            """Freeze JEPA backbone for downstream finetuning."""
            for p in self.jepa.context_encoder.parameters():
                p.requires_grad = False
            for p in self.jepa.target_encoder.parameters():
                p.requires_grad = False
            for p in self.jepa.predictor.parameters():
                p.requires_grad = False
            print("[PCBVisionSystem] Backbone frozen. Training heads only.")

        def unfreeze_backbone(self):
            """Unfreeze backbone for end-to-end finetuning."""
            for p in self.jepa.context_encoder.parameters():
                p.requires_grad = True
            print("[PCBVisionSystem] Backbone unfrozen.")

        # ── Pretraining API ───────────────────────────────────────────────────

        def jepa_forward(self, top_frames: "torch.Tensor",
                         bot_frames: "torch.Tensor"
                         ) -> Dict[str, "torch.Tensor"]:
            """
            Full JEPA pretraining forward pass.
            top_frames: (B, C, H, W) — top camera frames
            bot_frames: (B, C, H, W) — bottom camera frames
            """
            out = self.jepa(top_frames, bot_frames)
            loss_dict = self.jepa_loss_fn(out["predictions"], out["targets"])
            return loss_dict

        # ── Downstream Inference API ──────────────────────────────────────────

        @torch.inference_mode()
        def detect_components(self, top_frame: "torch.Tensor"
                              ) -> Dict[str, "torch.Tensor"]:
            """
            Detect and classify PCB components in top camera frame.
            top_frame: (B, C, H, W)
            """
            embed = self.jepa.context_encoder(top_frame)   # (B, N+1, D)
            cls_embed = embed[:, 0]                         # (B, D)
            class_logits, bbox = self.component_detector(cls_embed)
            return {
                "class_probs": F.softmax(class_logits, dim=-1),
                "bbox": bbox,   # normalized [x_c, y_c, w, h]
            }

        @torch.inference_mode()
        def correct_alignment(self, bot_frame: "torch.Tensor"
                              ) -> "torch.Tensor":
            """
            Compute nozzle alignment correction from bottom camera.
            bot_frame: (B, C, H, W)
            returns: (B, 3) — [Δθ (deg), Δx (mm), Δy (mm)]
            """
            embed = self.jepa.context_encoder(bot_frame)   # (B, N+1, D)
            return self.alignment_corrector(embed)

        @torch.inference_mode()
        def validate_placement(self, top_pre: "torch.Tensor",
                               top_post: "torch.Tensor") -> Dict:
            """
            Validate that placement succeeded.
            top_pre:  (B, C, H, W) — top camera BEFORE placement
            top_post: (B, C, H, W) — top camera AFTER placement
            returns: dict with 'pass_prob', 'fail_prob'
            """
            pre_embed  = self.jepa.context_encoder(top_pre)
            post_embed = self.jepa.context_encoder(top_post)
            logits = self.placement_validator(pre_embed, post_embed)
            probs  = F.softmax(logits, dim=-1)
            return {"fail_prob": probs[:, 0], "pass_prob": probs[:, 1]}


# ─────────────────────────────────────────────────────────────────────────────
# SECTION 5 — EMA SCHEDULER & TRAINING UTILITIES
# ─────────────────────────────────────────────────────────────────────────────

class EMAMomentumScheduler:
    """
    Cosine annealing schedule for EMA momentum.
    Starts at ema_momentum_start (e.g. 0.996) and anneals toward 1.0.
    Higher momentum = slower target encoder update = more stable targets.
    """
    def __init__(self, cfg: JEPAConfig, steps_per_epoch: int):
        self.m_start  = cfg.ema_momentum_start
        self.m_end    = cfg.ema_momentum_end
        self.total    = cfg.total_epochs * steps_per_epoch
        self.step_num = 0

    def step(self) -> float:
        progress = self.step_num / self.total
        m = self.m_end - (self.m_end - self.m_start) * (
            math.cos(math.pi * progress) + 1) / 2
        self.step_num += 1
        return m


class CosineWarmupScheduler:
    """
    Linear warmup followed by cosine decay for learning rate.
    """
    def __init__(self, optimizer: "torch.optim.Optimizer",
                 warmup_steps: int, total_steps: int,
                 base_lr: float, min_lr: float = 1e-6):
        self.optimizer    = optimizer
        self.warmup_steps = warmup_steps
        self.total_steps  = total_steps
        self.base_lr      = base_lr
        self.min_lr       = min_lr
        self.step_num     = 0

    def step(self):
        s = self.step_num
        if s < self.warmup_steps:
            lr = self.base_lr * s / max(1, self.warmup_steps)
        else:
            progress = (s - self.warmup_steps) / (self.total_steps - self.warmup_steps)
            lr = self.min_lr + 0.5 * (self.base_lr - self.min_lr) * (
                1 + math.cos(math.pi * progress))
        for pg in self.optimizer.param_groups:
            pg["lr"] = lr
        self.step_num += 1
        return lr


# ─────────────────────────────────────────────────────────────────────────────
# SECTION 6 — TRAINING LOOP SKELETON
# ─────────────────────────────────────────────────────────────────────────────

def pretrain_jepa(model: "PCBVisionSystem",
                  dataloader,         # yields (top_frames, bot_frames)
                  cfg: JEPAConfig,
                  device: str = "cpu"):
    """
    Phase 1: JEPA self-supervised pretraining.
    No labels required — just raw camera footage.

    Data collection tip: run the arm through its normal operation
    and record both cameras at ~10 fps. Even 1-2 hours of footage
    (~36,000-72,000 frame pairs) is enough to get meaningful pretraining
    given the relatively small embed_dim=256 and simple PCB scene structure.
    """
    if not TORCH_AVAILABLE:
        print("PyTorch required for training.")
        return

    dev = torch.device(device)
    model = model.to(dev)
    model.train()

    optimizer = torch.optim.AdamW(
        [p for p in model.jepa.parameters() if p.requires_grad],
        lr=cfg.learning_rate,
        weight_decay=cfg.weight_decay,
        betas=(0.9, 0.95),
    )

    steps_per_epoch = len(dataloader)
    total_steps     = cfg.total_epochs * steps_per_epoch

    lr_scheduler  = CosineWarmupScheduler(
        optimizer, cfg.warmup_epochs * steps_per_epoch,
        total_steps, cfg.learning_rate)
    ema_scheduler = EMAMomentumScheduler(cfg, steps_per_epoch)

    for epoch in range(cfg.total_epochs):
        for step, (top_frames, bot_frames) in enumerate(dataloader):
            top_frames = top_frames.to(dev)
            bot_frames = bot_frames.to(dev)

            # Forward
            loss_dict = model.jepa_forward(top_frames, bot_frames)
            loss = loss_dict["loss"]

            # Backward
            optimizer.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), cfg.grad_clip)
            optimizer.step()

            # Update EMA target encoder
            momentum = ema_scheduler.step()
            model.jepa.update_target_encoder(momentum)
            lr_scheduler.step()

            if step % 50 == 0:
                print(f"Epoch {epoch:03d} | Step {step:04d} | "
                      f"Loss: {loss.item():.4f} | "
                      f"L_jepa: {loss_dict['l_jepa'].item():.4f} | "
                      f"L_var: {loss_dict['l_variance'].item():.4f} | "
                      f"EMA_m: {momentum:.5f}")

        # Save checkpoint every 10 epochs
        if epoch % 10 == 0:
            torch.save({
                "epoch": epoch,
                "model_state": model.state_dict(),
                "optimizer_state": optimizer.state_dict(),
                "cfg": cfg,
            }, f"jepa_checkpoint_epoch{epoch:03d}.pt")


def finetune_downstream(model: "PCBVisionSystem",
                        labeled_dataloader,   # yields (top, bot, labels)
                        cfg: JEPAConfig,
                        device: str = "cpu"):
    """
    Phase 2: Train downstream heads with labeled data.
    Backbone is frozen — only the three heads are trained.

    Labels format:
      labels = {
        "class_idx": LongTensor (B,)     — component class
        "bbox":      FloatTensor (B, 4)  — normalized bounding box
        "delta":     FloatTensor (B, 3)  — [Δθ, Δx, Δy]
        "placement_ok": LongTensor (B,)  — 0=fail, 1=pass
      }
    """
    if not TORCH_AVAILABLE:
        print("PyTorch required for finetuning.")
        return

    dev = torch.device(device)
    model = model.to(dev)
    model.freeze_backbone()
    model.train()

    head_params = (list(model.component_detector.parameters()) +
                   list(model.alignment_corrector.parameters()) +
                   list(model.placement_validator.parameters()))

    optimizer = torch.optim.AdamW(head_params, lr=1e-4, weight_decay=0.01)
    ce_loss  = nn.CrossEntropyLoss()
    mse_loss = nn.MSELoss()

    for epoch in range(50):
        for top, bot, top_post, labels in labeled_dataloader:
            top      = top.to(dev)
            bot      = bot.to(dev)
            top_post = top_post.to(dev)

            # ── Component detection loss ───────────────────────────────────────
            det_out = model.detect_components(top)
            # (inference_mode is off during training — need grad)
            embed = model.jepa.context_encoder(top)
            cls_e = embed[:, 0]
            class_logits, bbox_pred = model.component_detector(cls_e)
            l_cls  = ce_loss(class_logits, labels["class_idx"].to(dev))
            l_bbox = mse_loss(bbox_pred, labels["bbox"].to(dev))

            # ── Alignment correction loss ──────────────────────────────────────
            bot_embed = model.jepa.context_encoder(bot)
            delta_pred = model.alignment_corrector(bot_embed)
            l_align = mse_loss(delta_pred, labels["delta"].to(dev))

            # ── Placement validation loss ──────────────────────────────────────
            pre_e  = model.jepa.context_encoder(top)
            post_e = model.jepa.context_encoder(top_post)
            val_logits = model.placement_validator(pre_e, post_e)
            l_valid = ce_loss(val_logits, labels["placement_ok"].to(dev))

            # ── Combined loss ──────────────────────────────────────────────────
            total = l_cls + 5.0 * l_bbox + 2.0 * l_align + l_valid

            optimizer.zero_grad()
            total.backward()
            torch.nn.utils.clip_grad_norm_(head_params, 1.0)
            optimizer.step()

        print(f"Finetune Epoch {epoch:03d} | "
              f"cls={l_cls.item():.3f} bbox={l_bbox.item():.3f} "
              f"align={l_align.item():.3f} valid={l_valid.item():.3f}")


# ─────────────────────────────────────────────────────────────────────────────
# SECTION 7 — INFERENCE / OPENPNP INTEGRATION
# ─────────────────────────────────────────────────────────────────────────────

class PCBInferenceEngine:
    """
    Real-time inference wrapper for integration with OpenPnP / Scan-N-Plan.

    Usage in OpenPnP scripting (Jython):
      from pcb_jepa_nn import PCBInferenceEngine
      engine = PCBInferenceEngine("jepa_final.pt")
      correction = engine.get_alignment_correction(bot_cam_frame)
      # correction = [Δθ, Δx, Δy] → pass to NEMA 8 + arm controller

    Scan-N-Plan integration:
      The detect_components() output (bbox + class) feeds directly into
      the Scan-N-Plan workspace_frame as the part_pose service response.
      The AlignmentCorrector output becomes the TCP offset correction.
    """

    def __init__(self, checkpoint_path: str, device: str = "cpu"):
        if not TORCH_AVAILABLE:
            raise RuntimeError("PyTorch required for inference engine.")

        cfg = JEPAConfig()
        self.model = PCBVisionSystem(cfg)
        self.model.eval()

        checkpoint = torch.load(checkpoint_path, map_location=device)
        self.model.load_state_dict(checkpoint["model_state"])
        self.device = torch.device(device)
        self.model  = self.model.to(self.device)

        # Image normalization (ImageNet stats — adjust if needed)
        self.mean = torch.tensor([0.485, 0.456, 0.406]).view(1, 3, 1, 1)
        self.std  = torch.tensor([0.229, 0.224, 0.225]).view(1, 3, 1, 1)

        print(f"[PCBInference] Model loaded from {checkpoint_path}")
        self._print_model_stats()

    def _print_model_stats(self):
        total = sum(p.numel() for p in self.model.parameters())
        trainable = sum(p.numel() for p in self.model.parameters()
                        if p.requires_grad)
        print(f"[PCBInference] Parameters: {total:,} total | "
              f"{trainable:,} trainable")

    def preprocess(self, frame: np.ndarray) -> "torch.Tensor":
        """
        frame: (H, W, 3) uint8 numpy array from USB camera
        returns: (1, 3, H, W) normalized float tensor
        """
        cfg = JEPAConfig()
        import cv2
        frame = cv2.resize(frame, (cfg.img_w, cfg.img_h))
        t = torch.from_numpy(frame).float() / 255.0
        t = t.permute(2, 0, 1).unsqueeze(0)  # (1, 3, H, W)
        return (t - self.mean) / self.std

    def get_alignment_correction(self, bot_frame: np.ndarray) -> Dict:
        """
        Main inference call for bottom camera alignment.
        Returns correction dict ready to send to arm controller.
        """
        x = self.preprocess(bot_frame).to(self.device)
        correction = self.model.correct_alignment(x)   # (1, 3)
        delta = correction[0].cpu().numpy()
        return {
            "delta_theta_deg": float(delta[0]),
            "delta_x_mm":      float(delta[1]),
            "delta_y_mm":      float(delta[2]),
        }

    def get_component_detections(self, top_frame: np.ndarray) -> Dict:
        """
        Inference call for top camera — returns detected components.
        Output maps to OpenPnP ReferenceNozzleTip coordinate system.
        """
        x = self.preprocess(top_frame).to(self.device)
        out = self.model.detect_components(x)
        probs = out["class_probs"][0].cpu().numpy()
        bbox  = out["bbox"][0].cpu().numpy()
        return {
            "top_class_idx":  int(probs.argmax()),
            "confidence":     float(probs.max()),
            "bbox_normalized": bbox.tolist(),   # [x_c, y_c, w, h] in 0-1
        }

    def check_placement(self, pre_frame: np.ndarray,
                        post_frame: np.ndarray) -> Dict:
        """Validate placement quality using pre/post top camera frames."""
        pre  = self.preprocess(pre_frame).to(self.device)
        post = self.preprocess(post_frame).to(self.device)
        result = self.model.validate_placement(pre, post)
        return {
            "pass_prob": float(result["pass_prob"][0]),
            "fail_prob": float(result["fail_prob"][0]),
            "decision":  "PASS" if result["pass_prob"][0] > 0.5 else "FAIL",
        }


# ─────────────────────────────────────────────────────────────────────────────
# SECTION 8 — DEMO / SMOKE TEST
# ─────────────────────────────────────────────────────────────────────────────

def run_demo():
    """
    Quick smoke test to verify the full architecture works end-to-end.
    Runs with random data — no real camera frames needed.
    """
    print("=" * 65)
    print("  PCBWorkspace JEPA Neural Network — Demo Forward Pass")
    print("=" * 65)

    cfg = JEPAConfig()
    print(f"\n[Config]")
    print(f"  Image size:    {cfg.img_h} x {cfg.img_w}")
    print(f"  Patch size:    {cfg.patch_size} x {cfg.patch_size}")
    print(f"  Num patches:   {cfg.num_patches}")
    print(f"  Embed dim:     {cfg.embed_dim}")
    print(f"  Encoder depth: {cfg.encoder_depth} blocks")

    # ── NumPy demo (always available) ─────────────────────────────────────────
    print("\n[NumPy Reference Implementation]")
    np_model = NumpyJEPA(cfg)
    result = np_model.demo_forward(batch_size=2)
    for k, v in result.items():
        print(f"  {k}: {v}")

    # ── PyTorch demo (if available) ────────────────────────────────────────────
    if TORCH_AVAILABLE:
        print("\n[PyTorch Production Implementation]")
        model = PCBVisionSystem(cfg)

        total_params = sum(p.numel() for p in model.parameters())
        jepa_params  = sum(p.numel() for p in model.jepa.parameters())
        head_params  = (sum(p.numel() for p in model.component_detector.parameters()) +
                        sum(p.numel() for p in model.alignment_corrector.parameters()) +
                        sum(p.numel() for p in model.placement_validator.parameters()))
        print(f"  Total parameters:  {total_params:,}")
        print(f"    JEPA backbone:   {jepa_params:,}")
        print(f"    Downstream heads:{head_params:,}")

        B, C, H, W = 2, cfg.in_channels, cfg.img_h, cfg.img_w
        top_frames = torch.randn(B, C, H, W)
        bot_frames = torch.randn(B, C, H, W)

        # JEPA pretraining forward pass
        model.train()
        loss_dict = model.jepa_forward(top_frames, bot_frames)
        print(f"\n  JEPA Pretraining:")
        for k, v in loss_dict.items():
            print(f"    {k}: {v.item():.4f}")

        # Downstream inference
        model.eval()
        det   = model.detect_components(top_frames)
        corr  = model.correct_alignment(bot_frames)
        valid = model.validate_placement(top_frames, bot_frames)

        print(f"\n  Downstream Heads:")
        print(f"    ComponentDetector  → class_probs shape: {det['class_probs'].shape}, bbox: {det['bbox'].shape}")
        print(f"    AlignmentCorrector → correction: {corr[0].detach().numpy().round(3)} [Δθ°, Δx mm, Δy mm]")
        print(f"    PlacementValidator → pass_prob: {valid['pass_prob'][0].item():.3f}")

        print("\n[✓] All forward passes completed successfully.")
    else:
        print("\n[!] Install PyTorch for full production model.")
        print("    pip install torch torchvision")

    print("\n" + "=" * 65)
    print("  Next Steps:")
    print("  1. Collect unlabeled footage from both cameras")
    print("  2. Run pretrain_jepa() for ~200 epochs")
    print("  3. Label ~500-1000 placement examples")
    print("  4. Run finetune_downstream() for ~50 epochs")
    print("  5. Use PCBInferenceEngine in OpenPnP scripting")
    print("  6. Integrate alignment output with Scan-N-Plan TCP offset")
    print("=" * 65)


if __name__ == "__main__":
    run_demo()
