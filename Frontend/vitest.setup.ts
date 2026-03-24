import '@testing-library/jest-dom';

// Mock navigator.mediaDevices.getUserMedia for tests to avoid noisy warnings from CameraView.
// Provides a minimal MediaStream-like object.
if (typeof navigator !== 'undefined') {
	// @ts-expect-error adding in test env
	if (!navigator.mediaDevices) navigator.mediaDevices = {};
	if (!navigator.mediaDevices.getUserMedia) {
		navigator.mediaDevices.getUserMedia = async () => {
			const track: any = {
				stop: () => {},
				enabled: true,
				getSettings: () => ({}),
				getConstraints: () => ({}),
				getCapabilities: () => ({})
			};
			const stream: any = {
				getTracks: () => [track],
				getVideoTracks: () => [track],
				getAudioTracks: () => [],
				addTrack: () => {},
				removeTrack: () => {}
			};
			return stream as MediaStream;
		};
	}
}

// Suppress specific console warnings from camera simulation if desired:
const origWarn = console.warn;
console.warn = (...args: any[]) => {
	const first = (args[0] || '').toString();
	if (first.includes('Camera access denied')) return; // drop noisy test warning
	origWarn(...args);
};
