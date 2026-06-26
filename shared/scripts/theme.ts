/** Dark/light toggle. Persisted, idempotent across view transitions. */

export function currentTheme(): "dark" | "light" {
	const t = document.documentElement.dataset.theme;
	if (t === "light" || t === "dark") return t;
	// Attribute missing/garbage → resolve from the persisted choice and stamp it,
	// so the first click is never a no-op. (The page renders light by default when
	// unset, but a naive "=== light ? light : dark" reports dark → first toggle to
	// light changes nothing on screen and reads as broken.)
	let resolved: "dark" | "light" = "dark";
	const m = document.cookie.match(/(?:^|; )theme=(dark|light)/);
	if (m) {
		resolved = m[1] as "dark" | "light";
	} else {
		try {
			const ls = localStorage.getItem("theme");
			if (ls === "light" || ls === "dark") resolved = ls;
		} catch {
			/* ignore */
		}
	}
	document.documentElement.dataset.theme = resolved;
	return resolved;
}

/**
 * Persist the theme. localStorage covers fast first paint + dev; a cookie scoped
 * to the parent domain (`.crsche.com`) carries the choice across the subdomain
 * jump between the homepage and the blog (separate origins → no shared storage).
 */
export function persistTheme(next: "dark" | "light"): void {
	try {
		localStorage.setItem("theme", next);
	} catch {
		/* ignore */
	}
	const host = location.hostname;
	const domain = host.endsWith("crsche.com") ? "; domain=.crsche.com" : "";
	// biome-ignore lint/suspicious/noDocumentCookie: parent-domain cookie syncs theme across the crsche.com↔blog.crsche.com subdomains (CookieStore can't set a cross-subdomain domain attr here)
	document.cookie = `theme=${next}; path=/; max-age=31536000; samesite=lax${domain}`;
}

export function initThemeToggle(): void {
	for (const b of document.querySelectorAll<HTMLElement>("[data-theme-toggle]:not([data-wired])")) {
		b.dataset.wired = "true";
		b.addEventListener("click", () => {
			const next = currentTheme() === "dark" ? "light" : "dark";
			document.documentElement.dataset.theme = next;
			persistTheme(next);
		});
	}
}
