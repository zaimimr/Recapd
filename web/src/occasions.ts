export type Occasion = {
	slug: string;
	lang: "en" | "nb";
	metaTitle: string;
	metaDescription: string;
	kicker: string;
	h1: string;
	intro: string;
	cta: string;
	points: { title: string; copy: string }[];
	faqs: { q: string; a: string }[];
};

const freeFaqEn = {
	q: "Is it free?",
	a: "Yes, for events up to 12 people. Bigger events need Pro on the host's account only. Guests always join free.",
};

const noAppFaqEn = {
	q: "Do guests need to download an app?",
	a: "No. Guests scan the QR code or open the link and add photos straight from the browser. They can also use the iPhone or Android app if they prefer.",
};

const deletionFaqEn = {
	q: "How long are the photos kept?",
	a: "The album stays up for 14 days after the event so everyone can download full-resolution copies. Then it is deleted automatically.",
};

export const occasions: Occasion[] = [
	{
		slug: "wedding-photo-sharing",
		lang: "en",
		metaTitle: "Wedding Photo Sharing App with QR Code | Recapd",
		metaDescription:
			"Collect every guest's wedding photos and videos in one private album. Guests scan a QR code, no app or account needed. Free for small weddings.",
		kicker: "Weddings",
		h1: "Every guest's wedding photos, in one album.",
		intro:
			"Your photographer gets the posed shots. Your guests get the dance floor, the speeches and the moments you missed. Put a QR code on the tables and collect all of it in one private album, in full quality.",
		cta: "Make your wedding album",
		points: [
			{
				title: "QR codes on every table",
				copy: "Print the ready-made table cards and posters. Guests scan and add photos in seconds.",
			},
			{
				title: "Full resolution, not chat copies",
				copy: "No more blurry photos forwarded through group chats. Every file arrives in original quality.",
			},
			{
				title: "Private by default",
				copy: "Only people with your code can see the album. Nothing is posted publicly.",
			},
		],
		faqs: [
			noAppFaqEn,
			{
				q: "How many guests can add photos?",
				a: "The free plan covers 12 people. Pro removes the limit, so every wedding guest can contribute.",
			},
			deletionFaqEn,
		],
	},
	{
		slug: "halloween-party-photos",
		lang: "en",
		metaTitle: "Halloween Party Photo Sharing with QR Code | Recapd",
		metaDescription:
			"Get every costume shot from your Halloween party in one shared album. Guests scan a QR code and upload, no app needed. Free for parties up to 12.",
		kicker: "Halloween",
		h1: "Who has the pics? Now everyone does.",
		intro:
			"Twenty costumes, twenty phones, and the best photos always end up stuck on someone else's camera roll. Stick a QR code by the door and every guest adds theirs to one shared album.",
		cta: "Make your Halloween album",
		points: [
			{
				title: "Scan the QR, done",
				copy: "Guests open the album in the browser and pick photos. No sign-up, no app store detour.",
			},
			{
				title: "Every costume, every angle",
				copy: "See the party from every phone in the room, not just your own.",
			},
			{
				title: "Download it all",
				copy: "Save the whole album in one tap before it expires.",
			},
		],
		faqs: [noAppFaqEn, freeFaqEn, deletionFaqEn],
	},
	{
		slug: "birthday-party-photos",
		lang: "en",
		metaTitle: "Shared Photo Album for Birthday Parties | Recapd",
		metaDescription:
			"One shared album for every photo from the birthday party. Guests join with a link or QR code and add photos from any phone. Free for up to 12 people.",
		kicker: "Birthdays",
		h1: "The whole birthday, from every phone.",
		intro:
			"Stop asking 'can you send me that?' in the group chat. Share one link and every guest adds their photos and videos to the same album.",
		cta: "Make your birthday album",
		points: [
			{
				title: "One link for everyone",
				copy: "Drop it in the group chat or show the QR code. Works on iPhone and Android.",
			},
			{
				title: "Photos and videos",
				copy: "The cake, the speech, the singing. Clips land in the album next to the photos.",
			},
			{
				title: "Nothing to set up for guests",
				copy: "No account, no download. They join in the browser in seconds.",
			},
		],
		faqs: [noAppFaqEn, freeFaqEn, deletionFaqEn],
	},
	{
		slug: "christmas-party-photos",
		lang: "en",
		metaTitle: "Christmas Party Photo Sharing for Teams and Families | Recapd",
		metaDescription:
			"Collect the office Christmas party or family gathering photos in one private album. Guests scan a QR code, no app needed.",
		kicker: "Christmas parties",
		h1: "The Christmas party album that builds itself.",
		intro:
			"Office party, family dinner or friends' gathering. Put the QR code on the table and everyone's photos end up in one private album instead of fifty private chats.",
		cta: "Make your Christmas album",
		points: [
			{
				title: "Works for big groups",
				copy: "From a family table to the whole office. Pro removes the guest limit.",
			},
			{
				title: "Private to the people who were there",
				copy: "Only guests with the code can see it. Nothing gets posted publicly.",
			},
			{
				title: "Gone after 14 days",
				copy: "Everyone downloads what they want, then the album deletes itself.",
			},
		],
		faqs: [noAppFaqEn, freeFaqEn, deletionFaqEn],
	},
	{
		slug: "graduation-party-photos",
		lang: "en",
		metaTitle: "Graduation Party Photo Sharing with QR Code | Recapd",
		metaDescription:
			"Collect every photo from the graduation party in one shared album. Friends and family scan a QR code and upload from any phone.",
		kicker: "Graduations",
		h1: "Every graduation photo, from everyone who came.",
		intro:
			"Parents, grandparents and friends all take photos. Give them one QR code and you get every shot in one album, in full quality.",
		cta: "Make your graduation album",
		points: [
			{
				title: "Easy for every generation",
				copy: "Scan, pick photos, done. No account and no app to install.",
			},
			{
				title: "Full quality",
				copy: "Originals, not compressed copies from a messaging app.",
			},
			{
				title: "One download",
				copy: "Save the whole album to your phone in one go.",
			},
		],
		faqs: [noAppFaqEn, freeFaqEn, deletionFaqEn],
	},
	{
		slug: "qr-code-event-photos",
		lang: "en",
		metaTitle: "QR Code for Event Photos: Let Guests Upload Pictures | Recapd",
		metaDescription:
			"Create a QR code guests can scan to upload photos to your event album. No app or account needed. Printable posters and table cards included.",
		kicker: "QR photo sharing",
		h1: "One QR code. Every guest's photos.",
		intro:
			"Create an event, print the QR code and put it where guests will see it. Anyone who scans can add photos and videos to the shared album from their browser.",
		cta: "Get your QR code",
		points: [
			{
				title: "Printable kit included",
				copy: "Posters, table cards and story images are made for every event.",
			},
			{
				title: "Works on any phone",
				copy: "The camera app reads the code and opens the album. iPhone and Android.",
			},
			{
				title: "You stay in control",
				copy: "The host owns the album and can remove anything that should not be there.",
			},
		],
		faqs: [
			noAppFaqEn,
			{
				q: "Where do I get the QR code?",
				a: "Create an event in the Recapd app. The QR code and printable kit are ready right away.",
			},
			freeFaqEn,
		],
	},
	{
		slug: "bryllup-bildedeling",
		lang: "nb",
		metaTitle: "Del bryllupsbilder med QR-kode | Recapd",
		metaDescription:
			"Samle alle gjestenes bilder og videoer fra bryllupet i ett privat album. Gjestene skanner en QR-kode, uten app og uten konto.",
		kicker: "Bryllup",
		h1: "Alle gjestenes bryllupsbilder, i ett album.",
		intro:
			"Fotografen tar de oppstilte bildene. Gjestene fanger dansegulvet, talene og øyeblikkene dere gikk glipp av. Sett en QR-kode på bordene og samle alt i ett privat album, i full kvalitet.",
		cta: "Lag bryllupsalbumet",
		points: [
			{
				title: "QR-kode på hvert bord",
				copy: "Skriv ut ferdige bordkort og plakater. Gjestene skanner og legger til bilder på sekunder.",
			},
			{
				title: "Full oppløsning",
				copy: "Ingen uskarpe kopier fra gruppechatten. Alt kommer i original kvalitet.",
			},
			{
				title: "Privat",
				copy: "Bare de som har koden kan se albumet. Ingenting deles offentlig.",
			},
		],
		faqs: [
			{
				q: "Må gjestene laste ned en app?",
				a: "Nei. Gjestene skanner QR-koden eller åpner lenken og legger til bilder rett i nettleseren.",
			},
			{
				q: "Er det gratis?",
				a: "Ja, for arrangementer med opptil 12 personer. Større arrangementer trenger Pro, men bare verten betaler.",
			},
			{
				q: "Hvor lenge ligger bildene ute?",
				a: "Albumet er tilgjengelig i 14 dager etter arrangementet. Deretter slettes det automatisk.",
			},
		],
	},
	{
		slug: "julebord-bilder",
		lang: "nb",
		metaTitle: "Del bilder fra julebordet med QR-kode | Recapd",
		metaDescription:
			"Samle alle bildene fra julebordet i ett privat album. Kollegaene skanner en QR-kode og legger til bilder, uten app og uten konto.",
		kicker: "Julebord",
		h1: "Julebordet, sett fra alles mobil.",
		intro:
			"Alle tar bilder, men ingen deler dem. Sett QR-koden på bordet, så havner bildene i ett felles album i stedet for i femti private chatter.",
		cta: "Lag julebordsalbumet",
		points: [
			{
				title: "Skann og del",
				copy: "Kollegaene åpner albumet i nettleseren og velger bilder. Ingen registrering.",
			},
			{
				title: "Bare for de som var der",
				copy: "Albumet er privat. Ingenting havner på sosiale medier.",
			},
			{
				title: "Slettes etter 14 dager",
				copy: "Alle laster ned det de vil ha, så forsvinner albumet av seg selv.",
			},
		],
		faqs: [
			{
				q: "Må alle laste ned en app?",
				a: "Nei. Det holder å skanne QR-koden. Appen finnes for iPhone og Android for de som vil.",
			},
			{
				q: "Hva koster det?",
				a: "Gratis for opptil 12 personer. Til større julebord trenger verten Pro. Gjestene betaler aldri.",
			},
			{
				q: "Hvor lenge ligger bildene ute?",
				a: "I 14 dager etter arrangementet. Deretter slettes albumet automatisk.",
			},
		],
	},
];
