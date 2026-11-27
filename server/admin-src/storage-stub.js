// The report code imports the app's stores only for their constants and helpers; in the admin
// page nothing is ever loaded or saved, so phone storage is replaced by this no-op.
const noop = async () => null;
export default { getItem: noop, setItem: noop, removeItem: noop };
export const flushPending = noop;
export const setRemoteClient = () => {};
