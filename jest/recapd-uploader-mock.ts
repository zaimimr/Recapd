export const RecapdUploader = {
	configure: jest.fn(async () => {}),
	enqueue: jest.fn(async () => [] as string[]),
	cancel: jest.fn(async () => {}),
	clearFailed: jest.fn(async () => {}),
	getQueueState: jest.fn(async () => ({ items: [] })),
	retry: jest.fn(async () => {}),
	kick: jest.fn(async () => {}),
	addProgressListener: jest.fn(() => ({ remove: jest.fn() })),
	addCompletedListener: jest.fn(() => ({ remove: jest.fn() })),
	addFailedListener: jest.fn(() => ({ remove: jest.fn() })),
	addDrainedListener: jest.fn(() => ({ remove: jest.fn() })),
};
