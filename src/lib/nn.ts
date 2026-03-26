export interface NNStatus {
  phase: string;
}

export interface AlignmentResult {
  delta_theta_deg: number;
  delta_x_mm: number;
  delta_y_mm: number;
}

export interface TrainingStatus {
  running: boolean;
  progress: number;
}

export const pingNNServer = async () => {
  await new Promise((r) => setTimeout(r, 500));
  return true; 
};

export const getNNStatus = async (): Promise<NNStatus> => {
  return { phase: "IDLE" };
};

export const getAlignmentCorrection = async (): Promise<AlignmentResult> => {
  await new Promise((r) => setTimeout(r, 1200)); 
  return {
    delta_theta_deg: (Math.random() * 10) - 5,
    delta_x_mm: (Math.random() * 0.8) - 0.4,
    delta_y_mm: (Math.random() * 0.8) - 0.4,
  };
};

export const startPretraining = async (epochs: number) => true;
export const startFinetuning = async (epochs: number) => true;
export const getTrainingStatus = async (): Promise<TrainingStatus> => ({ running: false, progress: 100 });