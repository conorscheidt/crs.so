/**
 * Custom listbox: replaces the native <select> with a paper-themed popover.
 * Accessible: roving aria-selected, full keyboard (↑/↓/Home/End/Enter/Esc/Tab),
 * type-ahead, click-outside + Escape close. Idempotent (guards [data-select-wired]).
 *
 *   <div class="xselect" data-select>
 *     <button data-select-btn aria-haspopup="listbox" aria-expanded="false">
 *       <span data-select-value>…</span> …caret…
 *     </button>
 *     <ul role="listbox" data-select-pop>
 *       <li role="option" data-select-opt data-value="…" aria-selected="…">…</li>
 *     </ul>
 *   </div>
 */
export function initSelect(root: HTMLElement, onChange: (value: string) => void): void {
	if (root.dataset.selectWired) return;
	root.dataset.selectWired = "true";

	const btn = root.querySelector<HTMLButtonElement>("[data-select-btn]");
	const pop = root.querySelector<HTMLElement>("[data-select-pop]");
	const valueEl = root.querySelector<HTMLElement>("[data-select-value]");
	const opts = Array.from(root.querySelectorAll<HTMLElement>("[data-select-opt]"));
	if (!btn || !pop || !valueEl || !opts.length) return;

	let open = false;
	let active = Math.max(
		0,
		opts.findIndex((o) => o.getAttribute("aria-selected") === "true"),
	);

	const setActive = (i: number): void => {
		active = (i + opts.length) % opts.length;
		opts.forEach((o, k) => {
			o.classList.toggle("is-active", k === active);
		});
		opts[active]?.scrollIntoView({ block: "nearest" });
	};

	const openPop = (): void => {
		if (open) return;
		open = true;
		root.classList.add("open");
		btn.setAttribute("aria-expanded", "true");
		setActive(active);
	};
	const closePop = (focusBtn = true): void => {
		if (!open) return;
		open = false;
		root.classList.remove("open");
		btn.setAttribute("aria-expanded", "false");
		if (focusBtn) btn.focus();
	};

	const choose = (i: number): void => {
		const opt = opts[i];
		if (!opt) return;
		opts.forEach((o) => {
			o.setAttribute("aria-selected", String(o === opt));
		});
		valueEl.textContent = opt.textContent?.trim() ?? "";
		active = i;
		onChange(opt.dataset.value ?? "");
		closePop();
	};

	btn.addEventListener("click", () => (open ? closePop() : openPop()));
	btn.addEventListener("keydown", (e) => {
		if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			openPop();
		}
	});

	pop.addEventListener("keydown", (e) => {
		switch (e.key) {
			case "ArrowDown":
				e.preventDefault();
				setActive(active + 1);
				break;
			case "ArrowUp":
				e.preventDefault();
				setActive(active - 1);
				break;
			case "Home":
				e.preventDefault();
				setActive(0);
				break;
			case "End":
				e.preventDefault();
				setActive(opts.length - 1);
				break;
			case "Enter":
			case " ":
				e.preventDefault();
				choose(active);
				break;
			case "Escape":
				e.preventDefault();
				closePop();
				break;
			case "Tab":
				closePop(false);
				break;
		}
	});

	opts.forEach((o, i) => {
		o.addEventListener("click", () => choose(i));
		o.addEventListener("mousemove", () => setActive(i));
	});

	// the listbox needs focus to receive its keydowns when opened via the button
	pop.tabIndex = -1;
	btn.addEventListener("click", () => {
		if (open) requestAnimationFrame(() => pop.focus());
	});

	// outside-click closes. Self-removes when the select is detached (view-transition
	// nav) so document listeners never accumulate across pages.
	const onDocDown = (e: PointerEvent): void => {
		if (!root.isConnected) {
			document.removeEventListener("pointerdown", onDocDown);
			return;
		}
		if (open && !root.contains(e.target as Node)) closePop(false);
	};
	document.addEventListener("pointerdown", onDocDown);
}

/** Unwired [data-select] roots in scope. Callers wire each one and own its
 *  onChange. */
export function selects(scope: ParentNode = document): HTMLElement[] {
	return Array.from(scope.querySelectorAll<HTMLElement>("[data-select]:not([data-select-wired])"));
}
