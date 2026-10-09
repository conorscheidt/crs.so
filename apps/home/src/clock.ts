/**
 * One rAF loop for the whole page. Frame subscribers (Lenis, uniform springs,
 * cursor, sim) tick every frame, and the loop never stops while any exist:
 * panel scrolling depends on it. Finite jobs (morphs, crossfades) run on top,
 * latest wins: a request during a job speeds the job up by
 * MOTION.interruptAccel and runs once it finishes.
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
	 * speeds up and only the latest queued action runs after it.
	 */
	request(action: () => void): void {
		if (!this.job) {
			action();
			return;
		}
		this.speed = MOTION.interruptAccel;
		this.pending = action;
	}

	/** ms until a job of `ms` requested now would finish, after the active one hurries out. */
	landing(ms: number): number {
		return this.job ? (this.job.duration - this.jobElapsed) / MOTION.interruptAccel + ms : ms;
	}

	/** After a bfcache restore or tab resume, drop the stale timestamp. */
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
			// Pages with no subscribers may sleep; subscribe() or run() restarts the
			// loop. The hub always has subscribers.
			this.running = false;
			return;
		}
		this.raf(this.tick);
	};
}
