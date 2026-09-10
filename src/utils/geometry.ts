/**
 * geometry.ts — Geometric primitives for normalized frame coordinates
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Normalized bounding box. All values in [0,1]. */
export interface BoundingBox {
  x: number; // left edge
  y: number; // top edge
  w: number; // width
  h: number; // height
  label?: string; // object class name
}

/** Normalized 2D point */
export interface Point {
  x: number;
  y: number;
}

export type LineOrientation = 'VERTICAL' | 'HORIZONTAL';

export type CountDirection = 'L2R' | 'R2L' | 'T2B' | 'B2T';

// ---------------------------------------------------------------------------
// BoundingBox helpers
// ---------------------------------------------------------------------------

export function bboxCenter(bbox: BoundingBox): Point {
  return {x: bbox.x + bbox.w / 2, y: bbox.y + bbox.h / 2};
}

export function bboxArea(bbox: BoundingBox): number {
  return bbox.w * bbox.h;
}

export function bboxToXYXY(bbox: BoundingBox): [number, number, number, number] {
  return [bbox.x, bbox.y, bbox.x + bbox.w, bbox.y + bbox.h];
}

export function xyxyToBbox(x1: number, y1: number, x2: number, y2: number): BoundingBox {
  return {x: x1, y: y1, w: x2 - x1, h: y2 - y1};
}

// ---------------------------------------------------------------------------
// IoU (Intersection over Union)
// ---------------------------------------------------------------------------

export function computeIoU(a: BoundingBox, b: BoundingBox): number {
  const ax1 = a.x, ay1 = a.y, ax2 = a.x + a.w, ay2 = a.y + a.h;
  const bx1 = b.x, by1 = b.y, bx2 = b.x + b.w, by2 = b.y + b.h;

  const ix1 = Math.max(ax1, bx1);
  const iy1 = Math.max(ay1, by1);
  const ix2 = Math.min(ax2, bx2);
  const iy2 = Math.min(ay2, by2);

  if (ix2 <= ix1 || iy2 <= iy1) return 0;

  const intersection = (ix2 - ix1) * (iy2 - iy1);
  const aArea = a.w * a.h;
  const bArea = b.w * b.h;
  const union = aArea + bArea - intersection;
  return union <= 0 ? 0 : intersection / union;
}

// ---------------------------------------------------------------------------
// Point helpers
// ---------------------------------------------------------------------------

export function pointDistance(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function lerpPoint(a: Point, b: Point, t: number): Point {
  return {x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t};
}

// ---------------------------------------------------------------------------
// Trajectory helpers
// ---------------------------------------------------------------------------

/** Compute the centroid of an array of points */
export function centroid(points: Point[]): Point {
  if (points.length === 0) return {x: 0, y: 0};
  const sum = points.reduce((acc, p) => ({x: acc.x + p.x, y: acc.y + p.y}), {x: 0, y: 0});
  return {x: sum.x / points.length, y: sum.y / points.length};
}

/** Estimate instantaneous velocity from last N positions */
export function estimateVelocity(history: Point[], n = 4): Point {
  if (history.length < 2) return {x: 0, y: 0};
  const count = Math.min(n, history.length);
  const recent = history.slice(-count);
  let dx = 0, dy = 0;
  for (let i = 1; i < recent.length; i++) {
    dx += recent[i].x - recent[i - 1].x;
    dy += recent[i].y - recent[i - 1].y;
  }
  const steps = recent.length - 1;
  return {x: dx / steps, y: dy / steps};
}

/** Predict next position from trajectory */
export function predictNextPosition(history: Point[]): Point {
  if (history.length === 0) return {x: 0.5, y: 0.5};
  const last = history[history.length - 1];
  const vel = estimateVelocity(history);
  return {x: last.x + vel.x, y: last.y + vel.y};
}

// ---------------------------------------------------------------------------
// IoU matrix for matching
// ---------------------------------------------------------------------------

/** Compute NxM IoU matrix between two arrays of bounding boxes */
export function computeIoUMatrix(
  boxesA: BoundingBox[],
  boxesB: BoundingBox[],
): number[][] {
  return boxesA.map(a => boxesB.map(b => computeIoU(a, b)));
}
