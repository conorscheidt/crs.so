/**
 * One persistent rAF loop for the whole page. Frame subscribers (lenis
 * instances, uniform springs, cursor lerp, sim render) tick every frame, and
 * the loop keeps running while any subscriber exists; panel scrolling depends
 * on it. Finite jobs (morphs, crossfades) layer on top with latest-wins
 * queueing: a request during an active job accelerates it by
 * MOTION.interruptAccel and runs the latest request when it completes, so
 * nothing snaps.
 */
import { MOTION } from "./motion";

export type Subscriber = (t: number, dt: number) => void;

export interface Job {
	kind: "morph" | "fade";
	/** ms */
	duration: number;
	step: (t01: number) => void;
	done?: () => void;
}

export class Clock {
	phase: "idle" | Job["kind"] = "idle";
	private readonly subs = new Set<Subscriber>();
	private job: Job | null = null;
	private jobElapsed = 0;
	private speed = 1;
	private pending: (() => void) | null = null;
	private last = 0;
	private running = false;
	private readonly raf: (cb: (t: number) => void) => void;

	constructor(raf?: (cb: (t: number) => void) => void) {
		this.raf = raf ?? ((cb) => requestAnimationFrame(cb));
	}

	subscribe(fn: Subscriber): () => void {
		this.subs.add(fn);
		this.start();
		return () => {
			this.subs.delete(fn);
		};
	}

	/** Start a job immediately, replacing any active one via its done() path. */
	run(job: Job): void {
		this.job = job;
		this.jobElapsed = 0;
		this.speed = 1;
		this.phase = job.kind;
		this.start();
	}

	/**
	 * Queue an action that starts a job. Idle: runs now. Busy: the active job
	 * accelerates and only the latest queued action survives to run after it.
	 */
	request(action: () => void): void {
		if (!this.job) {
			action();
			return;
		}
		this.speed = MOTION.interruptAccel;
		this.pending = action;
	}

	/** bfcache restore / tab resume: forget the stale timestamp (dt clamp aside). */
	epochReset(): void {
		this.last = 0;
	}

	private start(): void {
		if (this.running) return;
		this.running = true;
		this.raf(this.tick);
	}

	private readonly tick = (t: number): void => {
		const dt = this.last === 0 ? 1 / 60 : Math.min(1 / 30, (t - this.last) / 1000);
		this.last = t;
		for (const fn of this.subs) fn(t, dt);
		if (this.job) {
			this.jobElapsed += dt * 1000 * this.speed;
			const t01 = Math.min(1, this.jobElapsed / this.job.duration);
			this.job.step(t01);
			if (t01 >= 1) {
				const finished = this.job;
				this.job = null;
				this.phase = "idle";
				this.speed = 1;
				finished.done?.();
				const next = this.pending;
				this.pending = null;
				next?.();
			}
		}
		if (this.subs.size === 0 && !this.job) {
			// Fully quiescent pages (no lenis, no sim, no cursor) may sleep; any
			// subscribe/run restarts the loop. Hub pages never reach this state.
			this.running = false;
			return;
		}
		this.raf(this.tick);
	};
}
