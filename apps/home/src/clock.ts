/**
 * One rAF loop for the whole page. Frame subscribers (Lenis, uniform springs,
 * cursor, sim) tick every frame, and the loop never stops while any exist:
 * panel scrolling depends on it. Finite jobs (morphs, crossfades) run on top,
 * latest wins: a request during a job speeds the job up to
 * MOTION.interruptAccel, easing into it over MOTION.interruptRamp, and runs
 * once it finishes.
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

const RAMP_MS = MOTION.interruptRamp * 1000;

/**
 * Job ms covered in `ms` of real time by a job running at `pace` times real
 * time and easing exponentially toward `toward`.
 */
export function covered(ms: number, pace: number, toward: number): number {
	return toward * ms - (toward - pace) * RAMP_MS * -Math.expm1(-ms / RAMP_MS);
}

/** The pace after `ms` of easing from `pace` toward `toward`. */
export function paceAfter(ms: number, pace: number, toward: number): number {
	return toward + (pace - toward) * Math.exp(-ms / RAMP_MS);
}

/** Real ms a job needs to cover `job` ms, starting at `pace` and easing toward `toward`. */
export function realTime(job: number, pace: number, toward: number): number {
	if (!(job > 0)) return 0;
	// covered() rises at a pace that stays between the two, which brackets the answer.
	let lo = job / Math.max(pace, toward);
	let hi = job / Math.min(pace, toward);
	let ms = (lo + hi) / 2;
	for (let i = 0; i < 40; i++) {
		const err = covered(ms, pace, toward) - job;
		if (Math.abs(err) < 1e-9) break;
		if (err > 0) hi = ms;
		else lo = ms;
		// Newton, unless it would leave the bracket.
		const next = ms - err / paceAfter(ms, pace, toward);
		ms = next > lo && next < hi ? next : (lo + hi) / 2;
	}
	return ms;
}

export class Clock {
	phase: "idle" | Job["kind"] = "idle";
	private readonly subs = new Set<Subscriber>();
	private job: Job | null = null;
	private jobElapsed = 0;
	/** the job's pace now, and the pace it is easing toward */
	private pace = 1;
	private toward = 1;
	/** real ms left over from a frame in which the last job finished */
	private spare = 0;
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

	/**
	 * Start a job immediately, replacing any active one. Started by a request
	 * that waited on the job before, it picks up the rest of the frame in which
	 * that one finished, so the pair takes exactly as long as landing() said.
	 */
	run(job: Job): void {
		this.job = job;
		this.jobElapsed = this.spare;
		this.spare = 0;
		this.pace = 1;
		this.toward = 1;
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
		this.toward = MOTION.interruptAccel;
		this.pending = action;
	}

	/** ms until a job of `ms` requested now would finish, after the active one hurries out. */
	landing(ms: number): number {
		if (!this.job) return ms;
		return realTime(this.job.duration - this.jobElapsed, this.pace, MOTION.interruptAccel) + ms;
	}

	/** ms until the active job finishes at the pace it is on; 0 when idle. */
	left(): number {
		if (!this.job) return 0;
		return realTime(this.job.duration - this.jobElapsed, this.pace, this.toward);
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
		// The job steps first, so subscribers draw where it is at this frame
		// rather than where it was at the last.
		if (this.job) this.advance(dt * 1000);
		for (const fn of this.subs) fn(t, dt);
		if (this.subs.size === 0 && !this.job) {
			// Pages with no subscribers may sleep; subscribe() or run() restarts the
			// loop. The hub always has subscribers.
			this.running = false;
			return;
		}
		this.raf(this.tick);
	};

	private advance(ms: number): void {
		const job = this.job as Job;
		const left = job.duration - this.jobElapsed;
		// The pace eases within the frame too, so the job's progress does not
		// depend on the frame rate.
		const step = covered(ms, this.pace, this.toward);
		if (step < left) {
			this.jobElapsed += step;
			this.pace = paceAfter(ms, this.pace, this.toward);
			job.step(this.jobElapsed / job.duration);
			return;
		}
		const spare = ms - realTime(left, this.pace, this.toward);
		this.jobElapsed = job.duration;
		job.step(1);
		this.job = null;
		this.phase = "idle";
		this.pace = 1;
		this.toward = 1;
		job.done?.();
		const next = this.pending;
		this.pending = null;
		if (!next) return;
		this.spare = Math.max(0, spare);
		next();
		this.spare = 0;
	}
}
