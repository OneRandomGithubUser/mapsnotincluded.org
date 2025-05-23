// TODO: make the base error explicitly set or not set
// TODO: cascading warning/info/log
export function createError(locationName: string, msg: string, doConsoleLog: Boolean = false, baseError?: unknown): Error {
    const prefixedMsg = `[${locationName}] ❌ ${msg}`;
    const errorOptions = baseError ? {cause: baseError} : undefined;
    if (doConsoleLog) {
        console.error(prefixedMsg, baseError);
    }
    return new Error(prefixedMsg, errorOptions);
}