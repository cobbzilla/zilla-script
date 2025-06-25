import { delay } from "zilla-util";
import { evalArgWithType } from "./helpers.js";
export const runStepHandlers = async (step, handlers, logger, stepPrefix, cx, vars, sessions, res) => {
    if (step.handlers) {
        for (const stepHandler of step.handlers) {
            const hName = stepHandler.handler;
            if (stepHandler.delay) {
                logger.info(`${stepPrefix} waiting for delay=${stepHandler.delay} before starting handler=${hName}`);
                await delay(stepHandler.delay);
            }
            const stepHandlerParams = stepHandler.params ?? {};
            const initHandler = handlers[hName];
            if (!initHandler) {
                logger.error(`${stepPrefix} handler not found: ${hName}`);
            }
            if (initHandler.args) {
                for (const [field, config] of Object.entries(initHandler.args)) {
                    if (typeof stepHandlerParams[field] === "undefined") {
                        if (config.required) {
                            // throw new Error(
                            //   `${stepPrefix} handler=${hName} missing required arg=${field}`
                            // );
                        }
                        else if (config.default) {
                            stepHandlerParams[field] = config.default;
                        }
                    }
                }
            }
            const args = Object.fromEntries(Object.entries(stepHandlerParams).map(([param, value]) => [
                param,
                initHandler.args && initHandler.args[param].opaque
                    ? value
                    : evalArgWithType(value, cx, initHandler.args ? initHandler.args[param].type : undefined, `${stepPrefix} handler=${hName} wrong type for arg=${param}`),
            ]));
            const varsForHandler = { ...vars, ...sessions };
            const origKeys = Object.keys(varsForHandler);
            res = await initHandler.func(res, args, varsForHandler, step);
            for (const [k, v] of Object.entries(varsForHandler)) {
                if (!origKeys.includes(k)) {
                    cx[k] = vars[k] = v;
                }
            }
        }
    }
    return res;
};
//# sourceMappingURL=handler.js.map