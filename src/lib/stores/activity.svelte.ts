let _pulseCount = $state(0);
let _busy = $state(false);

export const activity = {
	get pulseCount() {
		return _pulseCount;
	},
	get busy() {
		return _busy;
	},
	pulse() {
		_pulseCount++;
	},
	setBusy(value: boolean) {
		_busy = value;
	}
};
