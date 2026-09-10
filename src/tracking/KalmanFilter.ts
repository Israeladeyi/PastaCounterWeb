/**
 * KalmanFilter.ts — 2D Kalman filter for object position tracking
 * State: [x, y, dx, dy] (position + velocity)
 * Observation: [x, y]
 */

export interface KalmanState {
  x: number; y: number;
  dx: number; dy: number;
}

export class KalmanFilter2D {
  // State: [x, y, dx, dy]
  private x = [0, 0, 0, 0];
  // 4x4 covariance matrix (flattened row-major)
  private P: number[] = [];
  // Process noise Q
  private readonly Q_pos = 1e-4;
  private readonly Q_vel = 1e-3;
  // Measurement noise R
  private readonly R_pos = 1e-2;
  private initialized = false;

  initialize(px: number, py: number): void {
    this.x = [px, py, 0, 0];
    this.P = [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ];
    this.initialized = true;
  }

  predict(): {x: number; y: number} {
    if (!this.initialized) return {x: 0, y: 0};
    // State transition: x += dx, y += dy
    this.x[0] += this.x[2];
    this.x[1] += this.x[3];

    // P = F*P*Ft + Q (F = identity with off-diag for velocity)
    // Simplified: add process noise
    this.P[0]  += this.Q_pos + this.P[2] + this.P[8];
    this.P[5]  += this.Q_pos + this.P[7] + this.P[13];
    this.P[10] += this.Q_vel;
    this.P[15] += this.Q_vel;

    return {x: this.x[0], y: this.x[1]};
  }

  update(mx: number, my: number): {x: number; y: number} {
    if (!this.initialized) {
      this.initialize(mx, my);
      return {x: mx, y: my};
    }

    // Innovation
    const innX = mx - this.x[0];
    const innY = my - this.x[1];

    // S = H*P*Ht + R (H selects x,y from state)
    const S00 = this.P[0] + this.R_pos;
    const S11 = this.P[5] + this.R_pos;

    // Avoid division by near-zero
    const s00Safe = Math.abs(S00) < 1e-10 ? 1e-10 : S00;
    const s11Safe = Math.abs(S11) < 1e-10 ? 1e-10 : S11;

    // Kalman gain K = P*Ht / S (simplified for diagonal S)
    const K0 = this.P[0] / s00Safe;   // gain for x → x
    const K1 = this.P[4] / s00Safe;   // gain for y → x
    const K2 = this.P[1] / s11Safe;   // gain for x → y
    const K3 = this.P[5] / s11Safe;   // gain for y → y
    const K4 = this.P[8] / s00Safe;   // gain for dx → x
    const K5 = this.P[12] / s00Safe;  // gain for dx → y
    const K6 = this.P[9] / s11Safe;
    const K7 = this.P[13] / s11Safe;

    // Update state
    this.x[0] += K0 * innX + K2 * innY;
    this.x[1] += K1 * innX + K3 * innY;
    this.x[2] += K4 * innX + K6 * innY;
    this.x[3] += K5 * innX + K7 * innY;

    // Update covariance P = (I - K*H) * P (simplified)
    this.P[0]  *= (1 - K0);
    this.P[5]  *= (1 - K3);
    this.P[10] *= 1;
    this.P[15] *= 1;

    return {x: this.x[0], y: this.x[1]};
  }

  getState(): KalmanState {
    return {x: this.x[0], y: this.x[1], dx: this.x[2], dy: this.x[3]};
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}
