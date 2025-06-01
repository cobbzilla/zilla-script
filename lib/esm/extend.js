// export function registerHelper(name: string, fn: HelperDelegate): void;
import Handlebars from "handlebars";
export const zillaHelper = (name, fn) => Handlebars.registerHelper(name, fn);
//# sourceMappingURL=extend.js.map