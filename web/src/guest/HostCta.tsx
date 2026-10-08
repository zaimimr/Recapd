const HOST_CTA_URL = "/?utm_source=recapd&utm_medium=guest";

export default function HostCta({ placement }: { placement: string }) {
	return (
		<aside className="host-cta">
			<p className="host-cta-title">Hosting something?</p>
			<p className="host-cta-body">Get every guest's photos in one album.</p>
			<a className="host-cta-link" href={`${HOST_CTA_URL}&utm_content=${placement}`}>
				Make your own album, free
			</a>
		</aside>
	);
}
