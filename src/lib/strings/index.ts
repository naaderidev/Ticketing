export { errors } from "./errors";
export { labels } from "./labels";
export { titles } from "./titles";
export { descriptions } from "./descriptions";
export { buttons } from "./buttons";
export { placeholders } from "./placeholders";
export { misc } from "./misc";

import { errors } from "./errors";
import { labels } from "./labels";
import { titles } from "./titles";
import { descriptions } from "./descriptions";
import { buttons } from "./buttons";
import { placeholders } from "./placeholders";
import { misc } from "./misc";

export const strings = {
  errors,
  labels,
  titles,
  descriptions,
  buttons,
  placeholders,
  misc,
} as const;
