"""
train.py — PCBWorkspace SERC
Fine-tunes pretrained ResNet18 on synthetic PCB data.

Strategy:
  Phase 1 (epochs 1-10):  Freeze backbone, train heads only (fast)
  Phase 2 (epochs 11-50): Unfreeze backbone, fine-tune everything (accurate)

Usage:
    python train.py
    python train.py --epochs 30
"""

import argparse, random, time
from pathlib import Path

import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
from torchvision import transforms
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance

from pcb_jepa_nn import JEPAConfig, PCBVisionSystem, multitask_loss

CHECKPOINT_PATH = "jepa_checkpoint.pt"

COMPONENT_CLASSES = [
    "Resistor", "Capacitor", "Diode", "LED", "Transistor",
    "Channel Port", "IC", "Crystal", "Inductor", "Fuse",
    "Button", "Connector", "SOT-23", "QFP", "BGA",
    "0402", "0603", "0805", "1206", "SOD-123",
]
DEFECT_CLASSES = [
    "none", "missing", "misaligned", "wrong_component",
    "solder_bridge", "tombstone",
]

COMPONENT_COLORS = {
    "Resistor": ("#d2b48c","#8B4513"), "Capacitor": ("#1a1a6e","#888888"),
    "Diode": ("#2a2a2a","#C0C0C0"), "LED": ("#ff3300","#ffdd00"),
    "Transistor": ("#1a1a1a","#ffffff"), "IC": ("#1a1a1a","#C0C0C0"),
    "Crystal": ("#C0C0C0","#888888"), "Inductor": ("#704214","#C0C0C0"),
    "Fuse": ("#f5f5dc","#888888"), "Button": ("#333333","#aaaaaa"),
    "Connector": ("#ffffff","#888888"), "Channel Port": ("#444444","#00aaff"),
    "SOT-23": ("#111111","#C0C0C0"), "QFP": ("#0a0a0a","#C0C0C0"),
    "BGA": ("#0a0a0a","#888888"), "0402": ("#d2b48c","#333333"),
    "0603": ("#d2b48c","#333333"), "0805": ("#d2b48c","#333333"),
    "1206": ("#d2b48c","#333333"), "SOD-123": ("#2a2a2a","#C0C0C0"),
}


def generate_pcb_image(component, defect, size=224):
    img = Image.new("RGB", (size, size), color=(26, 138, 74))
    draw = ImageDraw.Draw(img)
    for _ in range(random.randint(5, 15)):
        x1,y1 = random.randint(0,size), random.randint(0,size)
        x2,y2 = random.randint(0,size), random.randint(0,size)
        draw.line([(x1,y1),(x2,y2)], fill=(184,115,51), width=random.randint(2,5))
    for _ in range(random.randint(5, 20)):
        vx,vy = random.randint(10,size-10), random.randint(10,size-10)
        draw.ellipse([vx-4,vy-4,vx+4,vy+4], fill=(212,168,75))
    cx = random.randint(60, size-60)
    cy = random.randint(60, size-60)
    cw = random.randint(25, 55)
    ch = random.randint(20, 45)
    if defect == "misaligned":
        cx += random.randint(-25,25); cy += random.randint(-25,25)
    elif defect == "tombstone":
        cy -= random.randint(10,20); ch = int(ch*0.6)
    body_color, detail_color = COMPONENT_COLORS.get(component, ("#888888","#ffffff"))
    if defect != "missing":
        draw.rectangle([cx-cw,cy-ch,cx+cw,cy+ch], fill=body_color, outline=detail_color, width=2)
        if component in ("Resistor","0402","0603","0805","1206"):
            for bx in [-cw//2, 0, cw//2]:
                draw.rectangle([cx+bx-3,cy-ch,cx+bx+3,cy+ch], fill=detail_color)
        elif component in ("IC","QFP","BGA"):
            for i in range(4):
                draw.rectangle([cx-cw-4,cy-ch+i*8,cx-cw,cy-ch+i*8+4], fill=detail_color)
                draw.rectangle([cx+cw,cy-ch+i*8,cx+cw+4,cy-ch+i*8+4], fill=detail_color)
        elif component == "LED":
            draw.ellipse([cx-8,cy-8,cx+8,cy+8], fill=(255,80,0))
        elif component == "Capacitor":
            draw.ellipse([cx-cw,cy-ch,cx+cw,cy+ch], fill=body_color, outline=detail_color)
        if defect == "solder_bridge":
            draw.ellipse([cx+cw-5,cy-5,cx+cw+15,cy+5], fill=(180,180,50))
    draw.rectangle([cx-cw-12,cy-6,cx-cw-2,cy+6], fill=(212,168,75))
    draw.rectangle([cx+cw+2,cy-6,cx+cw+12,cy+6], fill=(212,168,75))
    img = img.filter(ImageFilter.GaussianBlur(radius=random.uniform(0.3,0.8)))
    img = ImageEnhance.Brightness(img).enhance(random.uniform(0.8,1.2))
    return img, (cx, cy, cw, ch)


class SyntheticPCBDataset(Dataset):
    def __init__(self, size=2000, augment=True):
        self.size = size
        self.transform = transforms.Compose([
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485,0.456,0.406], std=[0.229,0.224,0.225]),
        ])
        self.aug = transforms.Compose([
            transforms.RandomHorizontalFlip(),
            transforms.RandomVerticalFlip(),
            transforms.ColorJitter(brightness=0.3, contrast=0.3, saturation=0.2),
            transforms.RandomRotation(15),
        ]) if augment else None
        random.seed(42)
        self.samples = [
            (random.randint(0, len(COMPONENT_CLASSES)-1),
             random.randint(0, len(DEFECT_CLASSES)-1))
            for _ in range(size)
        ]

    def __len__(self): return self.size

    def __getitem__(self, idx):
        ci, di = self.samples[idx]
        img, (cx,cy,cw,ch) = generate_pcb_image(
            COMPONENT_CLASSES[ci], DEFECT_CLASSES[di])
        if self.aug: img = self.aug(img)
        tensor = self.transform(img)
        s = 224
        bbox = torch.tensor([cx/s, cy/s, cw*2/s, ch*2/s], dtype=torch.float32).clamp(0,1)
        return tensor, torch.tensor(ci), bbox, torch.tensor(di)


def train(epochs=50, batch_size=16, lr=1e-3):
    print("=" * 60)
    print("  PCBWorkspace SERC — ResNet18 Fine-tuning")
    print(f"  Epochs: {epochs}  Batch: {batch_size}  LR: {lr}")
    print("  Phase 1 (1-10): heads only | Phase 2 (11+): full model")
    print("=" * 60)

    cfg   = JEPAConfig()
    model = PCBVisionSystem(cfg)

    if Path(CHECKPOINT_PATH).exists():
        print(f"Resuming from {CHECKPOINT_PATH}")
        ckpt = torch.load(CHECKPOINT_PATH, map_location="cpu")
        try:
            model.load_state_dict(ckpt["model_state"])
        except Exception:
            print("  Checkpoint incompatible with new architecture — starting fresh")

    print(f"Total params: {sum(p.numel() for p in model.parameters()):,}")

    # Phase 1: freeze backbone
    for p in model.backbone.parameters():
        p.requires_grad = False
    print("Backbone frozen for phase 1")

    train_ds = SyntheticPCBDataset(size=2000, augment=True)
    val_ds   = SyntheticPCBDataset(size=400,  augment=False)
    train_dl = DataLoader(train_ds, batch_size=batch_size, shuffle=True,  num_workers=0)
    val_dl   = DataLoader(val_ds,   batch_size=batch_size, shuffle=False, num_workers=0)

    optimizer = optim.Adam(filter(lambda p: p.requires_grad, model.parameters()),
                           lr=lr, weight_decay=1e-4)
    scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs)
    best_val  = float("inf")

    for epoch in range(1, epochs+1):
        # Unfreeze backbone at epoch 11
        if epoch == 11:
            for p in model.backbone.parameters():
                p.requires_grad = True
            optimizer = optim.Adam(model.parameters(), lr=lr*0.1, weight_decay=1e-4)
            scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs-10)
            print("  Backbone unfrozen — fine-tuning full model")

        model.train()
        t0 = time.time()
        train_loss = 0.0
        for imgs, comp_labels, bbox_targets, defect_labels in train_dl:
            optimizer.zero_grad()
            outputs = model(imgs)
            loss, _ = multitask_loss(outputs, comp_labels, bbox_targets, defect_labels)
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            train_loss += loss.item()
        train_loss /= len(train_dl)

        model.eval()
        val_loss = comp_correct = defect_correct = total = 0
        with torch.no_grad():
            for imgs, comp_labels, bbox_targets, defect_labels in val_dl:
                outputs = model(imgs)
                loss, _ = multitask_loss(outputs, comp_labels, bbox_targets, defect_labels)
                val_loss      += loss.item()
                comp_correct  += (outputs["comp_logits"].argmax(1)==comp_labels).sum().item()
                defect_correct+= (outputs["defect_logits"].argmax(1)==defect_labels).sum().item()
                total         += len(imgs)
        val_loss /= len(val_dl)
        comp_acc   = comp_correct/total*100
        defect_acc = defect_correct/total*100

        print(f"Epoch {epoch:3d}/{epochs} | train={train_loss:.4f} val={val_loss:.4f} | "
              f"comp={comp_acc:.1f}% defect={defect_acc:.1f}% | {time.time()-t0:.1f}s")
        scheduler.step()

        if val_loss < best_val:
            best_val = val_loss
            torch.save({"model_state": model.state_dict(), "phase": "finetuned",
                        "epoch": epoch, "val_loss": val_loss,
                        "comp_acc": comp_acc, "defect_acc": defect_acc},
                       CHECKPOINT_PATH)
            print(f"  ✓ Saved (val={val_loss:.4f})")

    print(f"\nDone! Best val loss: {best_val:.4f} — checkpoint: {CHECKPOINT_PATH}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--epochs",     type=int,   default=50)
    parser.add_argument("--batch-size", type=int,   default=16)
    parser.add_argument("--lr",         type=float, default=1e-3)
    args = parser.parse_args()
    train(epochs=args.epochs, batch_size=args.batch_size, lr=args.lr)
