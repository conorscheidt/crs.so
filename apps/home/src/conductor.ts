/**
 * The conductor: sole owner of the animation clock and input arbitration. The
 * line engine and reveal choreography expose pure step functions; only the
 * conductor ticks.
 *
 * Arbitration:
 *   draw-in    → interruptible: accelerate ×3, then run the queued action
 *   travel     → one queued destination, latest click wins, current travel
 *                accelerates to completion first
 *   idle       → actions run immediately
 */
import { MOTION } from "./motion";

export type Phase = "idle" | "drawing" | "traveling";

export interface Job {
	/** Total duration at normal speed (ms). */
	duration: number;
	/** Progress callback, t ∈ [0,1] eased-free (constant rate; shape inside). */
	step: (t: number) => void;
	done?: () => void;
	kind: Exclude<Phase, "idle">;
}

export class Conductor {
	phase: Phase = "idle";
	private job: Job | null = null;
	private started = 0;
	private elapsedBase = 0;
	private speed = 1;
	private queued: (() => void) | null = null;
	private raf = 0;

	/** Run a job now (only from idle, or internally after a queue pop). */
	run(job: Job): void {
		this.cancelFrame();
		this.job = job;
		this.phase = job.kind;
		this.speed = 1;
		this.elapsedBase = 0;
		this.started = performance.now();
		this.tick();
	}

	/**
	 * Request an action. Idle → runs immediately. Busy → becomes the single
	 * queued action (latest wins) and the current job accelerates to its end.
	 */
	request(action: () => void): void {
		if (this.phase === "idle") {
			action();
			return;
		}
		this.queued = action;
		if (this.speed === 1) {
			this.elapsedBase = this.elapsed();
			this.started = performance.now();
			this.speed = MOTION.interruptAccel;
		}
	}

	private elapsed(): number {
		return this.elapsedBase + (performance.now() - this.started) * this.speed;
	}

	private tick = (): void => {
		const job = this.job;
		if (!job) return;
		const t = Math.min(1, this.elapsed() / job.duration);
		job.step(t);
		if (t < 1) {
			this.raf = requestAnimationFrame(this.tick);
			return;
		}
		this.job = null;
		this.phase = "idle";
		job.done?.();
		const q = this.queued;
		this.queued = null;
		q?.();
	};

	private cancelFrame(): void {
		if (this.raf) cancelAnimationFrame(this.raf);
		this.raf = 0;
	}
}
