// export function registerHelper(name: string, fn: HelperDelegate): void;

import Handlebars, { HelperDelegate } from "handlebars";

export const zillaHelper = (name: string, fn: HelperDelegate): void =>
  Handlebars.registerHelper(name, fn);
