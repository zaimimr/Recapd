import type { KitData } from "../event";
import type { KitFormat } from "../formats";
import { Poster } from "./Poster";
import { Social } from "./Social";
import { Story } from "./Story";
import { TableCard } from "./TableCard";

const TEMPLATES = { social: Social, story: Story, table: TableCard, poster: Poster };

export function renderTemplate(format: KitFormat, data: KitData) {
	const Template = TEMPLATES[format];
	return <Template {...data} />;
}
