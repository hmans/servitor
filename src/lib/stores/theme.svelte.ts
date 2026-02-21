import { browser } from '$app/environment';

export type Theme = 'light' | 'dark';

function createThemeStore() {
	let theme = $state<Theme>('dark');

	if (browser) {
		const stored = localStorage.getItem('theme');
		theme = stored === 'light' ? 'light' : 'dark';
	}

	function apply(t: Theme) {
		if (!browser) return;
		document.documentElement.classList.toggle('light', t === 'light');
		localStorage.setItem('theme', t);
	}

	function toggle() {
		theme = theme === 'dark' ? 'light' : 'dark';
		apply(theme);
	}

	return {
		get current() {
			return theme;
		},
		toggle
	};
}

export const theme = createThemeStore();
