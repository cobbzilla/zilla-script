import { evalTpl } from "./helpers.js";
import { DEFAULT_LOGGER } from "zilla-util";
import { runScriptSteps } from "./step.js";
export const runZillaScript = async (script, opts = {}) => {
    const logger = opts.logger ?? DEFAULT_LOGGER;
    const env = opts.env ?? {};
    // merge init blocks -- runtime init overrides script init
    const init = Object.assign({}, script.init || {}, opts.init || {});
    if (!init.servers) {
        throw new Error(`script=${script.script} has no servers defined in init`);
    }
    const vars = { ...init.vars };
    const handlers = {
        ...init.handlers,
    };
    const sessions = init.sessions || {};
    const servers = init.servers.map((s, i) => ({
        ...s,
        name: s.server ?? `default-${i}`,
        base: evalTpl(s.base, { env }),
        session: s.session ? s.session : init.session,
    }));
    const defServer = servers[0].name;
    logger.info(`***** [SCRIPT ${script.script}] starting`);
    const stepResults = await runScriptSteps({
        logger,
        scriptOpts: opts,
        env,
        steps: script.steps,
        servers,
        defServer,
        vars,
        sessions,
        handlers,
    });
    logger.info(`***** [SCRIPT ${script.script}] finished`);
    return { script, stepResults };
};
//# sourceMappingURL=engine.js.map