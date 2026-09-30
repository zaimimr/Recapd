import { createElement } from "react";
import type { KitData } from "../event.js";
import type { KitFormat } from "../formats.js";
import { Poster } from "./Poster.js";
import { Social } from "./Social.js";
import { Story } from "./Story.js";
import { TableCard } from "./TableCard.js";

const TEMPLATES = { social: Social, story: Story, table: TableCard, poster: Poster };

export function renderTemplate(format: KitFormat, data: KitData) {
	return createElement(TEMPLATES[format], data);
}
