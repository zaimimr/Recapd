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
	related: string[];
	alternate?: string;
};

export const labels = {
	en: {
		faq: "FAQ",
		getApp: "Get the app",
		privacy: "Privacy Policy",
		more: "Related occasions",
		all: "All occasions",
		switchLang: "Norsk",
	},
	nb: {
		faq: "Spørsmål",
		getApp: "Last ned appen",
		privacy: "Personvern",
		more: "Relaterte anledninger",
		all: "Alle anledninger",
		switchLang: "English",
	},
};

export const hub = {
	slug: "occasions",
	metaTitle: "Event Photo Sharing for Every Occasion | Recapd",
	metaDescription:
		"Weddings, birthdays, parties, trips, julebord and more. Recapd finds every guest's photos from your event and collects them in one private album.",
	kicker: "Occasions",
	h1: "One private album for every kind of event.",
	intro:
		"Recapd finds the photos and videos each guest took during your event and preselects them, so sharing is one tap. Pick your occasion.",
	nbHeading: "På norsk",
};

const autoFindFaqEn = {
	q: "How does Recapd find the photos?",
	a: "In the Recapd app you set the event's start and end time. Afterwards the app looks through each guest's camera roll for photos and videos taken in that window and preselects them. Guests check the selection and tap share. Guests who join in the browser pick their photos themselves.",
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

const autoFindFaqNb = {
	q: "Hvordan finner Recapd bildene?",
	a: "I Recapd-appen setter du start- og sluttid for arrangementet. Etterpå ser appen gjennom kamerarullen til hver gjest etter bilder og videoer tatt i det tidsrommet og velger dem ut på forhånd. Gjestene ser over utvalget og trykker del. Gjester som blir med i nettleseren, velger bildene selv.",
};

const noAppFaqNb = {
	q: "Må gjestene laste ned en app?",
	a: "Nei. Gjestene skanner QR-koden eller åpner lenken og legger til bilder rett i nettleseren. Appen finnes for iPhone og Android for de som vil.",
};

const freeFaqNb = {
	q: "Er det gratis?",
	a: "Ja, for arrangementer med opptil 12 personer. Større arrangementer trenger Pro, men bare verten betaler. Gjestene blir alltid med gratis.",
};

const deletionFaqNb = {
	q: "Hvor lenge ligger bildene ute?",
	a: "Albumet er tilgjengelig i 14 dager etter arrangementet, så alle kan laste ned bildene i full oppløsning. Deretter slettes det automatisk.",
};

export const occasions: Occasion[] = [
	{
		slug: "wedding-photo-sharing",
		lang: "en",
		alternate: "bryllup-bildedeling",
		metaTitle: "Wedding Photo Sharing App with QR Code | Recapd",
		metaDescription:
			"Recapd finds every guest's wedding photos and videos and collects them in one private album. Guests scan a QR code, no app or account needed.",
		kicker: "Weddings",
		h1: "Every guest's wedding photos, in one album.",
		intro:
			"Your photographer gets the posed shots. Your guests get the dance floor, the speeches and the moments you missed. Recapd finds those photos on each guest's phone and preselects them, so sharing takes one tap. Put a QR code on the tables and collect all of it in one private album, in full quality.",
		cta: "Make your wedding album",
		points: [
			{
				title: "It finds the photos for you",
				copy: "Recapd looks for photos taken during the wedding on each guest's phone. Guests check the selection and tap share.",
			},
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
			autoFindFaqEn,
			noAppFaqEn,
			{
				q: "How many guests can add photos?",
				a: "The free plan covers 12 people. Pro removes the limit, so every wedding guest can contribute.",
			},
			deletionFaqEn,
		],
		related: [
			"engagement-party-photos",
			"bridal-shower-photos",
			"bachelorette-party-photos",
			"anniversary-party-photos",
		],
	},
	{
		slug: "halloween-party-photos",
		lang: "en",
		metaTitle: "Halloween Party Photo Sharing with QR Code | Recapd",
		metaDescription:
			"Get every costume shot from your Halloween party in one shared album. Recapd finds each guest's photos for them. Free for parties up to 12.",
		kicker: "Halloween",
		h1: "Who has the pics? Now everyone does.",
		intro:
			"Twenty costumes, twenty phones, and the best photos always end up stuck on someone else's camera roll. Recapd finds every photo taken during the party on each guest's phone and preselects it. Stick a QR code by the door and every guest adds theirs to one shared album.",
		cta: "Make your Halloween album",
		points: [
			{
				title: "No digging through October",
				copy: "Only photos and videos from the party window are preselected. Guests tap share and they are done.",
			},
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
		faqs: [autoFindFaqEn, noAppFaqEn, freeFaqEn, deletionFaqEn],
		related: [
			"party-photo-sharing",
			"new-years-eve-party-photos",
			"christmas-party-photos",
			"birthday-party-photos",
		],
	},
	{
		slug: "birthday-party-photos",
		lang: "en",
		alternate: "bursdag-bilder",
		metaTitle: "Shared Photo Album for Birthday Parties | Recapd",
		metaDescription:
			"One shared album for every photo from the birthday party. Recapd finds each guest's photos automatically. Join by link or QR code, free for 12.",
		kicker: "Birthdays",
		h1: "The whole birthday, from every phone.",
		intro:
			"Stop asking 'can you send me that?' in the group chat. Recapd finds the photos and videos each guest took during the party and preselects them. Share one link and everyone adds theirs to the same album in one tap.",
		cta: "Make your birthday album",
		points: [
			{
				title: "Photos found automatically",
				copy: "Set the party's start and end time. Recapd picks out what was shot in between on each phone.",
			},
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
		faqs: [autoFindFaqEn, noAppFaqEn, freeFaqEn, deletionFaqEn],
		related: [
			"party-photo-sharing",
			"quinceanera-photo-sharing",
			"anniversary-party-photos",
			"baby-shower-photos",
		],
	},
	{
		slug: "christmas-party-photos",
		lang: "en",
		alternate: "julebord-bilder",
		metaTitle: "Christmas Party Photo Sharing for Teams and Families | Recapd",
		metaDescription:
			"Collect the office Christmas party or family gathering photos in one private album. Recapd finds every guest's photos. No app needed.",
		kicker: "Christmas parties",
		h1: "The Christmas party album that builds itself.",
		intro:
			"Office party, family dinner or friends' gathering. Recapd finds the photos each guest took during the party and preselects them, so everyone's shots end up in one private album instead of fifty private chats.",
		cta: "Make your Christmas album",
		points: [
			{
				title: "Found, not forwarded",
				copy: "Recapd preselects the photos from the party on each phone. One tap to share.",
			},
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
		faqs: [autoFindFaqEn, noAppFaqEn, freeFaqEn, deletionFaqEn],
		related: [
			"holiday-party-photos",
			"corporate-event-photo-sharing",
			"new-years-eve-party-photos",
			"thanksgiving-photo-sharing",
		],
	},
	{
		slug: "graduation-party-photos",
		lang: "en",
		metaTitle: "Graduation Party Photo Sharing with QR Code | Recapd",
		metaDescription:
			"Collect every photo from the graduation party in one shared album. Recapd finds the photos on each guest's phone. Join by QR code.",
		kicker: "Graduations",
		h1: "Every graduation photo, from everyone who came.",
		intro:
			"Parents, grandparents and friends all take photos. Recapd finds the ones taken during the ceremony and the party on each phone and preselects them. Give everyone one QR code and you get every shot in one album, in full quality.",
		cta: "Make your graduation album",
		points: [
			{
				title: "Ceremony and party",
				copy: "Set the event window to cover the whole day. Recapd finds everything in it.",
			},
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
		faqs: [autoFindFaqEn, noAppFaqEn, freeFaqEn, deletionFaqEn],
		related: [
			"prom-photo-sharing",
			"school-event-photo-sharing",
			"reunion-photo-sharing",
			"party-photo-sharing",
		],
	},
	{
		slug: "qr-code-event-photos",
		lang: "en",
		metaTitle: "QR Code for Event Photos: Let Guests Upload Pictures | Recapd",
		metaDescription:
			"Create a QR code guests can scan to add photos to your event album. No app or account needed. Printable posters and table cards included.",
		kicker: "QR photo sharing",
		h1: "One QR code. Every guest's photos.",
		intro:
			"Create an event, print the QR code and put it where guests will see it. Anyone who scans can add photos and videos from the browser. Guests with the app get even less work: Recapd finds their photos from the event and preselects them.",
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
				title: "A 6-character code too",
				copy: "No camera handy? Guests type the short event code instead.",
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
			autoFindFaqEn,
			freeFaqEn,
		],
		related: [
			"party-photo-sharing",
			"wedding-photo-sharing",
			"corporate-event-photo-sharing",
			"conference-photo-sharing",
		],
	},
	{
		slug: "party-photo-sharing",
		lang: "en",
		alternate: "fest-bilder",
		metaTitle: "Party Photo Sharing App: Collect Every Guest's Photos | Recapd",
		metaDescription:
			"Recapd finds the party photos on every guest's phone and collects them in one private album. Guests join by QR code, no app or account needed.",
		kicker: "Parties",
		h1: "The party photos find their own way home.",
		intro:
			"Everyone shot the night, nobody sends anything. Recapd fixes that. After the party, the app looks through each guest's camera roll for photos and videos taken during the party and preselects them. One tap and they land in a shared album you can all browse and download.",
		cta: "Make your party album",
		points: [
			{
				title: "It finds the photos for you",
				copy: "No scrolling back through a week of screenshots. Recapd only shows what was taken between the start and end time you set.",
			},
			{
				title: "Join with a code",
				copy: "Guests scan the QR code or type the 6-character code. No account, and no app needed in the browser.",
			},
			{
				title: "Videos too",
				copy: "The dance-off and the toast land next to the photos, in original quality.",
			},
			{
				title: "No feed, no audience",
				copy: "The album is private to the people who were there. Nothing is posted anywhere.",
			},
		],
		faqs: [
			autoFindFaqEn,
			{
				q: "Can I use it for a small house party?",
				a: "Yes. The free plan covers up to 12 people, which fits most house parties. Only the host needs Pro if more people join.",
			},
			noAppFaqEn,
			deletionFaqEn,
		],
		related: [
			"birthday-party-photos",
			"halloween-party-photos",
			"new-years-eve-party-photos",
			"bachelorette-party-photos",
		],
	},
	{
		slug: "new-years-eve-party-photos",
		lang: "en",
		metaTitle: "New Year's Eve Party Photo Sharing | Recapd",
		metaDescription:
			"Midnight, fireworks, the countdown. Recapd finds every guest's New Year's Eve photos and videos and collects them in one private album.",
		kicker: "New Year's Eve",
		h1: "Midnight, from every phone in the room.",
		intro:
			"At midnight every phone goes up at once. Then the clips scatter across a dozen camera rolls. Set the event from evening to early morning and Recapd finds everything shot in between, so guests share the countdown with one tap on New Year's Day.",
		cta: "Make your New Year's album",
		points: [
			{
				title: "Set it for the whole night",
				copy: "Start at dinner, end after the afterparty. Photos and videos from that window are preselected on each guest's phone.",
			},
			{
				title: "Fireworks in full quality",
				copy: "Photos and videos arrive as originals, not the squashed versions from a group chat.",
			},
			{
				title: "Uploads keep going",
				copy: "In the app, uploads continue in the background, so a sleepy guest can share and put the phone away.",
			},
			{
				title: "One album for the whole crowd",
				copy: "Everyone joins with the same QR code or 6-character code.",
			},
		],
		faqs: [
			autoFindFaqEn,
			{
				q: "Does it work when the party runs past midnight?",
				a: "Yes. The event window can cross midnight, so photos from both sides of the countdown are included.",
			},
			freeFaqEn,
			deletionFaqEn,
		],
		related: [
			"party-photo-sharing",
			"christmas-party-photos",
			"holiday-party-photos",
			"halloween-party-photos",
		],
	},
	{
		slug: "easter-photo-sharing",
		lang: "en",
		metaTitle: "Easter Photo Sharing for Families | Recapd",
		metaDescription:
			"Collect the egg hunt, the brunch and the whole family's Easter photos in one private album. Recapd finds the photos on every phone for you.",
		kicker: "Easter",
		h1: "The whole family's Easter, in one album.",
		intro:
			"Grandparents with tablets, cousins with new phones, an egg hunt nobody filmed from the same angle. Recapd looks through each phone for photos taken during the Easter weekend and preselects them, so even the least techy relative can share with one tap.",
		cta: "Make your Easter album",
		points: [
			{
				title: "Covers the whole weekend",
				copy: "Set the event across several days. Everything from Friday to Monday is found automatically.",
			},
			{
				title: "Easy for every age",
				copy: "Scan a QR code, check the photos, tap share. No account to create.",
			},
			{
				title: "Kids' moments, kept private",
				copy: "The album is only visible to people with the code. Nothing is posted publicly.",
			},
			{
				title: "Everyone gets the originals",
				copy: "Download the full album in full resolution, not chat-sized copies.",
			},
		],
		faqs: [
			autoFindFaqEn,
			{
				q: "Can relatives who were not there see the album?",
				a: "Anyone you give the code or link to can join and look. Share it with the family members who could not make it.",
			},
			noAppFaqEn,
			deletionFaqEn,
		],
		related: [
			"thanksgiving-photo-sharing",
			"holiday-party-photos",
			"reunion-photo-sharing",
			"christmas-party-photos",
		],
	},
	{
		slug: "thanksgiving-photo-sharing",
		lang: "en",
		metaTitle: "Thanksgiving Photo Sharing: One Family Album | Recapd",
		metaDescription:
			"Recapd finds the Thanksgiving photos on every guest's phone and puts them in one private album. Join by QR code, no app or account needed.",
		kicker: "Thanksgiving",
		h1: "Every seat at the table, every photo.",
		intro:
			"The turkey shot, the kids' table, the game on TV. Everyone captured a different part of Thanksgiving. Recapd looks through each guest's camera roll for photos from the day and preselects them, so the family album is done before the leftovers are.",
		cta: "Make your Thanksgiving album",
		points: [
			{
				title: "No more 'send me that one'",
				copy: "Recapd preselects every photo from the day. Guests check it and tap share.",
			},
			{
				title: "Relatives on any phone",
				copy: "iPhone, Android or a browser. Family joins with a QR code or a 6-character code.",
			},
			{
				title: "Download the whole album",
				copy: "Save everything in full resolution in one go.",
			},
			{
				title: "Cleans up after itself",
				copy: "The album deletes itself 14 days after Thanksgiving.",
			},
		],
		faqs: [
			autoFindFaqEn,
			{
				q: "We celebrate in several houses. Does that matter?",
				a: "No. Recapd looks at when a photo was taken, not where. Anyone in the event can share from wherever they celebrated.",
			},
			noAppFaqEn,
			freeFaqEn,
		],
		related: [
			"easter-photo-sharing",
			"holiday-party-photos",
			"reunion-photo-sharing",
			"christmas-party-photos",
		],
	},
	{
		slug: "holiday-party-photos",
		lang: "en",
		metaTitle: "Holiday Party Photo Sharing with QR Code | Recapd",
		metaDescription:
			"Collect every photo from the holiday party in one private album. Recapd finds each guest's photos automatically. Free for up to 12 people.",
		kicker: "Holiday parties",
		h1: "The holiday party, without the photo chase.",
		intro:
			"Ugly sweaters, gift swaps, the toast that went on too long. Recapd finds the holiday party photos on every guest's phone by looking at when they were taken, then lets each guest share the whole set with a single tap.",
		cta: "Make your holiday album",
		points: [
			{
				title: "Finds the right photos",
				copy: "Only shots from the party window are preselected. No digging through December.",
			},
			{
				title: "Office, family or friends",
				copy: "Use it for the team party, the neighborhood gathering or dinner with friends.",
			},
			{
				title: "Printable QR codes",
				copy: "Every event comes with posters and table cards for the venue.",
			},
			{
				title: "Private and temporary",
				copy: "Only guests with the code can see it, and it deletes itself 14 days after the party.",
			},
		],
		faqs: [
			autoFindFaqEn,
			freeFaqEn,
			{
				q: "Can I use one album for several holiday parties?",
				a: "Each event has its own time window, so it works best to create one event per party. Every event gets its own code.",
			},
			deletionFaqEn,
		],
		related: [
			"christmas-party-photos",
			"new-years-eve-party-photos",
			"thanksgiving-photo-sharing",
			"corporate-event-photo-sharing",
		],
	},
	{
		slug: "bachelorette-party-photos",
		lang: "en",
		metaTitle: "Bachelorette and Hen Party Photo Sharing | Recapd",
		metaDescription:
			"Every photo from the bachelorette or hen party in one private album. Recapd finds the photos on everyone's phone. No feed, nothing public.",
		kicker: "Bachelorette and hen parties",
		h1: "What happens on the hen do stays in one private album.",
		intro:
			"A weekend away, matching outfits and about a thousand photos split across the group. Recapd finds every photo and video taken during the trip on each phone and preselects it. Everyone shares in one tap, and the album stays between the people who were there.",
		cta: "Make the bachelorette album",
		points: [
			{
				title: "Built for weekends",
				copy: "Set the event across the whole trip. Recapd finds everything from the first drink to Sunday brunch.",
			},
			{
				title: "Everyone reviews first",
				copy: "Photos are preselected, not uploaded blindly. Each guest can untick anything before sharing.",
			},
			{
				title: "Private, no feed",
				copy: "There is no public profile and no feed. Only people with the code see the album.",
			},
			{
				title: "The bride gets everything",
				copy: "Download the full album in original quality as a keepsake before it expires.",
			},
		],
		faqs: [
			autoFindFaqEn,
			{
				q: "Who can see the album?",
				a: "Only people you share the code or link with. You decide who joins, and the host can remove any photo.",
			},
			noAppFaqEn,
			deletionFaqEn,
		],
		related: [
			"bachelor-party-photos",
			"bridal-shower-photos",
			"wedding-photo-sharing",
			"group-trip-photo-sharing",
		],
	},
	{
		slug: "bachelor-party-photos",
		lang: "en",
		metaTitle: "Bachelor Party and Stag Do Photo Sharing | Recapd",
		metaDescription:
			"Collect the bachelor party photos from every phone in one private album. Recapd finds them automatically. No feed, no public posts.",
		kicker: "Bachelor parties and stag dos",
		h1: "The stag do, collected. Kept private.",
		intro:
			"The groom will want some of these photos. Probably not all of them. Recapd finds every photo and video from the weekend on each guest's phone and preselects it, so everyone can review and share in one tap to an album only the group can see.",
		cta: "Make the bachelor party album",
		points: [
			{
				title: "Everyone checks before sharing",
				copy: "Recapd preselects the photos, but each guest reviews the selection and can untick anything before it uploads.",
			},
			{
				title: "Host stays in control",
				copy: "The host can remove anything from the album that should not be there.",
			},
			{
				title: "The whole weekend",
				copy: "Set the event from arrival to the last night out. Everything in between is found.",
			},
			{
				title: "Gone after 14 days",
				copy: "Download the keepers. The album deletes itself automatically.",
			},
		],
		faqs: [
			autoFindFaqEn,
			{
				q: "Is anything posted publicly?",
				a: "No. Recapd has no feed and no public profiles. The album is only visible to people who join with the code.",
			},
			freeFaqEn,
			deletionFaqEn,
		],
		related: [
			"bachelorette-party-photos",
			"group-trip-photo-sharing",
			"wedding-photo-sharing",
			"festival-photo-sharing",
		],
	},
	{
		slug: "baby-shower-photos",
		lang: "en",
		metaTitle: "Baby Shower Photo Sharing with QR Code | Recapd",
		metaDescription:
			"Gather every photo from the baby shower in one private album. Recapd finds each guest's photos automatically. Guests join by QR code, no app.",
		kicker: "Baby showers",
		h1: "Every smile from the baby shower, in one place.",
		intro:
			"Gifts, games and the parents-to-be laughing at the onesie with the bad pun. Your guests caught it all. Recapd finds the shower photos on each guest's phone and preselects them, so sharing takes one tap instead of a week of reminders.",
		cta: "Make your baby shower album",
		points: [
			{
				title: "Nothing to chase afterwards",
				copy: "Guests open Recapd and their photos from the shower are already selected.",
			},
			{
				title: "A QR code on the gift table",
				copy: "Print the ready-made card and guests scan it on their way in.",
			},
			{
				title: "A keepsake in full quality",
				copy: "Download every original for the baby book.",
			},
			{
				title: "Only for the guests",
				copy: "The album is private to people with the code. Nothing goes on social media.",
			},
		],
		faqs: [
			autoFindFaqEn,
			{
				q: "Can family who could not come see the photos?",
				a: "Yes. Send them the link and they can browse and download while the album is up.",
			},
			noAppFaqEn,
			deletionFaqEn,
		],
		related: ["bridal-shower-photos", "birthday-party-photos", "engagement-party-photos"],
	},
	{
		slug: "bridal-shower-photos",
		lang: "en",
		metaTitle: "Bridal Shower Photo Sharing App | Recapd",
		metaDescription:
			"One private album for every bridal shower photo. Recapd finds the photos on each guest's phone. Guests join with a QR code, no account.",
		kicker: "Bridal showers",
		h1: "The bridal shower, from every guest's angle.",
		intro:
			"Bridal showers are full of small moments: the gift reactions, the games, the toast from her oldest friend. Recapd looks through each guest's camera roll for photos from the shower and preselects them, so the bride gets all of it without asking twice.",
		cta: "Make the bridal shower album",
		points: [
			{
				title: "Found, not forwarded",
				copy: "Recapd preselects the right photos on each phone. No group chat requests.",
			},
			{
				title: "Ready for the wedding",
				copy: "Use one album for the shower and another for the big day. Each event gets its own code.",
			},
			{
				title: "Full resolution",
				copy: "Originals only, sharp enough to print.",
			},
			{
				title: "Join in seconds",
				copy: "Guests scan the QR code and add photos from the browser. No sign-up.",
			},
		],
		faqs: [
			autoFindFaqEn,
			freeFaqEn,
			{
				q: "Can I make separate albums for the shower and the wedding?",
				a: "Yes. Each event is its own album with its own code and QR code.",
			},
			deletionFaqEn,
		],
		related: [
			"bachelorette-party-photos",
			"wedding-photo-sharing",
			"engagement-party-photos",
			"baby-shower-photos",
		],
	},
	{
		slug: "engagement-party-photos",
		lang: "en",
		metaTitle: "Engagement Party Photo Sharing | Recapd",
		metaDescription:
			"Collect every photo from your engagement party in one private album. Recapd finds guests' photos automatically. Join by QR code, no app.",
		kicker: "Engagement parties",
		h1: "You said yes. Now get the photos.",
		intro:
			"Your friends filmed the ring reveal from six angles. Recapd finds those photos and videos on each guest's phone by the time they were taken and preselects them, so everyone shares in one tap and you get every angle in one album.",
		cta: "Make your engagement album",
		points: [
			{
				title: "Every angle of the ring",
				copy: "Photos and videos from the whole party, gathered from every phone.",
			},
			{
				title: "No account for guests",
				copy: "Guests join with a QR code or a 6-character code, in the app or the browser.",
			},
			{
				title: "Works after the fact",
				copy: "Create the event after the party with the right times. Recapd still finds the photos.",
			},
			{
				title: "Download everything",
				copy: "Save the whole album in original quality in one tap.",
			},
		],
		faqs: [
			autoFindFaqEn,
			{
				q: "What if the proposal was a surprise?",
				a: "Create the event afterwards with the right start and end time. Recapd still finds the photos from that window on each guest's phone.",
			},
			noAppFaqEn,
			deletionFaqEn,
		],
		related: [
			"wedding-photo-sharing",
			"bridal-shower-photos",
			"anniversary-party-photos",
			"party-photo-sharing",
		],
	},
	{
		slug: "anniversary-party-photos",
		lang: "en",
		metaTitle: "Anniversary Party Photo Sharing | Recapd",
		metaDescription:
			"Collect every guest's photos from the anniversary party in one private album. Recapd finds them automatically. Free for up to 12 people.",
		kicker: "Anniversaries",
		h1: "Decades together. One album from everyone.",
		intro:
			"A silver or golden anniversary brings together family who rarely share a room. Recapd finds the photos each guest took during the party and preselects them, so the couple ends up with every speech, hug and dance in one place.",
		cta: "Make the anniversary album",
		points: [
			{
				title: "Simple for older guests",
				copy: "Scan the QR code, check the photos, tap share. No sign-up.",
			},
			{
				title: "Every speech on video",
				copy: "Clips are collected next to the photos, in original quality.",
			},
			{
				title: "No photos left behind",
				copy: "Recapd preselects everything from the party on each phone, so nothing is forgotten.",
			},
			{
				title: "One download for the couple",
				copy: "Save the whole album at full resolution in one go.",
			},
		],
		faqs: [
			autoFindFaqEn,
			{
				q: "Can family who live far away see the photos?",
				a: "Yes. Send them the link and they can browse and download from anywhere while the album is up.",
			},
			freeFaqEn,
			deletionFaqEn,
		],
		related: [
			"wedding-photo-sharing",
			"reunion-photo-sharing",
			"birthday-party-photos",
			"engagement-party-photos",
		],
	},
	{
		slug: "reunion-photo-sharing",
		lang: "en",
		metaTitle: "Family and Class Reunion Photo Sharing | Recapd",
		metaDescription:
			"Bring every reunion photo together in one private album. Recapd finds the photos on each guest's phone. Join with a QR code, no account.",
		kicker: "Reunions",
		h1: "Everyone came back. So should the photos.",
		intro:
			"Class reunions and family reunions happen once in a while, and the photos usually vanish into a hundred camera rolls. Recapd finds each guest's photos from the reunion and preselects them, so the whole group gets the whole day.",
		cta: "Make the reunion album",
		points: [
			{
				title: "Made for big groups",
				copy: "Pro removes the 12-person limit, and only the host pays.",
			},
			{
				title: "No account to remember",
				copy: "Old classmates join with a code. Nothing to sign up for.",
			},
			{
				title: "The photos come to you",
				copy: "Recapd preselects what each guest shot during the reunion. One tap to share.",
			},
			{
				title: "Download and keep",
				copy: "Everyone saves what they want in full quality before the album closes after 14 days.",
			},
		],
		faqs: [
			autoFindFaqEn,
			{
				q: "How many people can join a reunion album?",
				a: "Up to 12 on the free plan. With Pro on the host's account there is no limit on participants.",
			},
			noAppFaqEn,
			deletionFaqEn,
		],
		related: [
			"anniversary-party-photos",
			"graduation-party-photos",
			"thanksgiving-photo-sharing",
			"school-event-photo-sharing",
		],
	},
	{
		slug: "corporate-event-photo-sharing",
		lang: "en",
		metaTitle: "Corporate Event and Offsite Photo Sharing | Recapd",
		metaDescription:
			"Collect photos from team offsites, company parties and corporate events in one private album. Recapd finds every participant's photos.",
		kicker: "Corporate events",
		h1: "Your offsite, captured by the whole team.",
		intro:
			"Team photos end up on forty personal phones and never reach the internal newsletter. Recapd finds every photo taken during the offsite or company party on each participant's phone and preselects it. People tap share, and you get one private album to work from.",
		cta: "Make the company album",
		points: [
			{
				title: "Private by design",
				copy: "Albums are only visible to people with the code. No public feed, no social profiles.",
			},
			{
				title: "Multi-day offsites",
				copy: "Set the event across the whole trip and Recapd finds photos from every day.",
			},
			{
				title: "Full-resolution originals",
				copy: "Sharp enough for the intranet, the newsletter or the office wall.",
			},
			{
				title: "Auto-deletes",
				copy: "The album is deleted 14 days after the event, so nothing lingers.",
			},
		],
		faqs: [
			autoFindFaqEn,
			{
				q: "Do employees need to create an account?",
				a: "No. Participants join with a QR code or a 6-character code in the browser, or use the app if they prefer.",
			},
			freeFaqEn,
			deletionFaqEn,
		],
		related: [
			"conference-photo-sharing",
			"christmas-party-photos",
			"holiday-party-photos",
			"sports-team-photo-sharing",
		],
	},
	{
		slug: "conference-photo-sharing",
		lang: "en",
		metaTitle: "Conference Photo Sharing for Attendees | Recapd",
		metaDescription:
			"Let attendees share conference photos in one private album. Recapd finds photos taken during the event on each phone. QR posters included.",
		kicker: "Conferences",
		h1: "Every talk, every booth, every attendee's camera.",
		intro:
			"Attendees photograph slides, stages and hallway moments all day. Recapd finds the photos taken during the conference on each attendee's phone and preselects them, so sharing is one tap. Put the QR code on the registration desk and the opening slide.",
		cta: "Make the conference album",
		points: [
			{
				title: "Scan from the stage",
				copy: "Show the QR code on screen and attendees join in seconds. No app required.",
			},
			{
				title: "Multi-day events",
				copy: "Set the window across every conference day. Recapd finds what was shot in between.",
			},
			{
				title: "Original files",
				copy: "Photos arrive at full resolution, ready for your recap.",
			},
			{
				title: "Host moderates",
				copy: "Remove anything that should not be in the album.",
			},
		],
		faqs: [
			autoFindFaqEn,
			{
				q: "Is there a limit on attendees?",
				a: "The free plan covers 12 people. Pro on the host's account removes the participant limit.",
			},
			noAppFaqEn,
			deletionFaqEn,
		],
		related: [
			"corporate-event-photo-sharing",
			"festival-photo-sharing",
			"qr-code-event-photos",
			"concert-photo-sharing",
		],
	},
	{
		slug: "festival-photo-sharing",
		lang: "en",
		metaTitle: "Festival Photo Sharing for Your Group | Recapd",
		metaDescription:
			"Your festival crew shot hundreds of photos and videos. Recapd finds them on every phone and collects them in one private album.",
		kicker: "Festivals",
		h1: "Three days, one festival album.",
		intro:
			"Festival weekends produce thousands of photos across your group and terrible signal to share them. Recapd finds every photo and video taken during the festival on each phone and preselects it. Tap share when you are back on wifi and the uploads finish in the background.",
		cta: "Make the festival album",
		points: [
			{
				title: "Set the whole weekend",
				copy: "From the first gate to the last encore, Recapd finds what was shot in between.",
			},
			{
				title: "Bad signal is fine",
				copy: "Share whenever you have a connection. In the app, uploads continue in the background.",
			},
			{
				title: "Videos included",
				copy: "Crowd clips and front-row videos land in full quality.",
			},
			{
				title: "Just your crew",
				copy: "A private album for the people you went with. No feed and no strangers.",
			},
		],
		faqs: [
			autoFindFaqEn,
			{
				q: "Does it work without signal at the festival?",
				a: "Recapd finds the photos on your phone any time after they were taken, so you can share once you are back on a connection.",
			},
			freeFaqEn,
			deletionFaqEn,
		],
		related: [
			"concert-photo-sharing",
			"group-trip-photo-sharing",
			"bachelor-party-photos",
			"party-photo-sharing",
		],
	},
	{
		slug: "concert-photo-sharing",
		lang: "en",
		metaTitle: "Concert Photo and Video Sharing | Recapd",
		metaDescription:
			"Collect every concert photo and video from your group in one private album. Recapd finds them automatically by the time they were shot.",
		kicker: "Concerts",
		h1: "That front-row clip is already in the album.",
		intro:
			"Your friend got the encore from the front. You got the back of someone's head. Recapd finds the photos and videos each person took during the concert and preselects them, so the whole group gets the best angles without a single 'send me that'.",
		cta: "Make the concert album",
		points: [
			{
				title: "Found by showtime",
				copy: "Set the concert's start and end. Only what was shot in between is preselected.",
			},
			{
				title: "Videos in original quality",
				copy: "No chat compression. Every clip arrives as it was recorded.",
			},
			{
				title: "Join with a code",
				copy: "Share the 6-character code in the group chat and everyone joins.",
			},
			{
				title: "Download it all",
				copy: "Save every photo and clip in one tap.",
			},
		],
		faqs: [
			autoFindFaqEn,
			{
				q: "How long can videos be?",
				a: "Up to 30 seconds on the free plan and up to 5 minutes with Pro.",
			},
			noAppFaqEn,
			deletionFaqEn,
		],
		related: [
			"festival-photo-sharing",
			"party-photo-sharing",
			"group-trip-photo-sharing",
			"new-years-eve-party-photos",
		],
	},
	{
		slug: "group-trip-photo-sharing",
		lang: "en",
		metaTitle: "Group Trip and Vacation Photo Sharing | Recapd",
		metaDescription:
			"Share vacation photos with your travel group in one private album. Recapd finds every photo from the trip on each phone automatically.",
		kicker: "Trips and vacations",
		h1: "The whole trip, from everyone's camera roll.",
		intro:
			"Two weeks, five friends, thousands of photos and one shared folder nobody uploads to. Set the trip's dates and Recapd finds every photo and video each traveller took in that window and preselects it, so the group album fills up with one tap per person.",
		cta: "Make the trip album",
		points: [
			{
				title: "Multi-day by default",
				copy: "Set the departure and return days. Everything from the trip is found, nothing from before or after.",
			},
			{
				title: "Shares in the background",
				copy: "In the app, uploads keep going when you close it, which helps on hotel wifi.",
			},
			{
				title: "Full resolution for prints",
				copy: "Originals only, so the photo book looks sharp.",
			},
			{
				title: "Private to the group",
				copy: "No feed and no public profiles. Only travellers with the code see the album.",
			},
		],
		faqs: [
			autoFindFaqEn,
			{
				q: "Do we all need the same kind of phone?",
				a: "No. iPhone and Android users share to the same album, and anyone can join in a browser.",
			},
			freeFaqEn,
			deletionFaqEn,
		],
		related: [
			"bachelorette-party-photos",
			"festival-photo-sharing",
			"bachelor-party-photos",
			"reunion-photo-sharing",
		],
	},
	{
		slug: "sports-team-photo-sharing",
		lang: "en",
		metaTitle: "Sports Team and Tournament Photo Sharing | Recapd",
		metaDescription:
			"Collect every parent's and player's photos from the match or tournament in one private album. Recapd finds the photos automatically.",
		kicker: "Sports teams",
		h1: "Every goal, from every parent on the sideline.",
		intro:
			"At a youth tournament, ten parents film the same match from ten spots. Recapd finds the photos and videos each one took during the tournament and preselects them, so the whole team gets every goal and every celebration in one private album.",
		cta: "Make the team album",
		points: [
			{
				title: "Private for the team",
				copy: "Only families with the code can see the album. Nothing ends up public.",
			},
			{
				title: "Tournament weekends",
				copy: "Set the event across all match days and Recapd finds everything in between.",
			},
			{
				title: "Clips from the sideline",
				copy: "Short videos arrive in full quality next to the photos.",
			},
			{
				title: "One code per season event",
				copy: "Create a new event for each match or cup. Every album gets its own code.",
			},
		],
		faqs: [
			autoFindFaqEn,
			{
				q: "Is it safe for photos of children?",
				a: "The album is private to people with the code, there is no public feed, and the host can remove any photo. Everything is deleted 14 days after the event.",
			},
			noAppFaqEn,
			freeFaqEn,
		],
		related: [
			"school-event-photo-sharing",
			"corporate-event-photo-sharing",
			"reunion-photo-sharing",
			"group-trip-photo-sharing",
		],
	},
	{
		slug: "prom-photo-sharing",
		lang: "en",
		metaTitle: "Prom Photo Sharing with QR Code | Recapd",
		metaDescription:
			"Every prom photo, from every friend, in one private album. Recapd finds the photos on each phone automatically. Join with a QR code.",
		kicker: "Prom",
		h1: "Prom night, from every phone in the limo.",
		intro:
			"Pre-prom photos, the entrance, the dance floor, the after. Your group took hundreds. Recapd finds every photo and video from prom night on each friend's phone and preselects it, so everyone shares the whole night with one tap.",
		cta: "Make the prom album",
		points: [
			{
				title: "The whole night",
				copy: "Set the window from pre-prom photos to the afterparty. Recapd finds everything in it.",
			},
			{
				title: "No more AirDrop roulette",
				copy: "iPhone and Android share to the same album.",
			},
			{
				title: "Only your group sees it",
				copy: "Private album, no feed, no public profiles.",
			},
			{
				title: "Download before it expires",
				copy: "Save everything in full quality within 14 days.",
			},
		],
		faqs: [
			autoFindFaqEn,
			noAppFaqEn,
			{
				q: "Can parents join to see the photos?",
				a: "Yes, if you give them the code or link. You choose who joins.",
			},
			deletionFaqEn,
		],
		related: [
			"graduation-party-photos",
			"school-event-photo-sharing",
			"party-photo-sharing",
			"birthday-party-photos",
		],
	},
	{
		slug: "school-event-photo-sharing",
		lang: "en",
		metaTitle: "School Event Photo Sharing for Parents | Recapd",
		metaDescription:
			"Collect photos from school plays, sports days and class trips in one private album. Recapd finds each parent's photos automatically.",
		kicker: "School events",
		h1: "The school play, from every parent's seat.",
		intro:
			"Every parent films their own child and misses the rest. Recapd finds the photos and videos each parent took during the school event and preselects them, so the class gets one private album with every child in it.",
		cta: "Make the school album",
		points: [
			{
				title: "Private by default",
				copy: "Only families with the code can join. Nothing is public and there is no feed.",
			},
			{
				title: "One QR code for the hall",
				copy: "Print the poster and put it by the entrance.",
			},
			{
				title: "Plays, sports days and trips",
				copy: "Set the event window and Recapd finds the photos from it on every parent's phone.",
			},
			{
				title: "Deleted after 14 days",
				copy: "Parents download what they want, then the album is removed automatically.",
			},
		],
		faqs: [
			autoFindFaqEn,
			{
				q: "Who can see photos of the children?",
				a: "Only people who join with the event code. The host can remove any photo at any time.",
			},
			noAppFaqEn,
			freeFaqEn,
		],
		related: [
			"prom-photo-sharing",
			"graduation-party-photos",
			"sports-team-photo-sharing",
			"confirmation-photo-sharing",
		],
	},
	{
		slug: "confirmation-photo-sharing",
		lang: "en",
		alternate: "konfirmasjon-bilder",
		metaTitle: "Confirmation Party Photo Sharing | Recapd",
		metaDescription:
			"Collect every photo from the confirmation day and party in one private album. Recapd finds family photos automatically. Join by QR code.",
		kicker: "Confirmations",
		h1: "The confirmation day, from the whole family.",
		intro:
			"The ceremony, the family dinner, the speeches. Relatives photograph different parts of the day. Recapd finds each guest's photos from the confirmation and preselects them, so the confirmand gets the whole day in one album.",
		cta: "Make the confirmation album",
		points: [
			{
				title: "Easy for grandparents",
				copy: "Scan the QR code, check the selection, tap share.",
			},
			{
				title: "Speeches on video",
				copy: "Clips from the dinner land next to the photos, in original quality.",
			},
			{
				title: "Cards for every table",
				copy: "Print ready-made table cards so guests can share from their seats.",
			},
			{
				title: "A keepsake download",
				copy: "Save the whole album in full resolution in one tap.",
			},
		],
		faqs: [
			autoFindFaqEn,
			{
				q: "Can we include both the ceremony and the party?",
				a: "Yes. Set the event from the ceremony to the end of the party and Recapd finds photos from the whole day.",
			},
			noAppFaqEn,
			freeFaqEn,
		],
		related: [
			"bar-mitzvah-photo-sharing",
			"quinceanera-photo-sharing",
			"graduation-party-photos",
			"birthday-party-photos",
		],
	},
	{
		slug: "quinceanera-photo-sharing",
		lang: "en",
		metaTitle: "Quinceañera Photo Sharing with QR Code | Recapd",
		metaDescription:
			"Collect every guest's quinceañera photos and videos in one private album. Recapd finds them automatically. Guests join with a QR code.",
		kicker: "Quinceañeras",
		h1: "Her quinceañera, through every guest's eyes.",
		intro:
			"The entrance, the waltz, the surprise dance. Family and friends film every second. Recapd finds the photos and videos each guest took during the celebration and preselects them, so the quinceañera gets all of it in one album, in full quality.",
		cta: "Make the quinceañera album",
		points: [
			{
				title: "Every angle of the waltz",
				copy: "Videos and photos from the whole room, collected in one place.",
			},
			{
				title: "Big guest lists",
				copy: "Pro on the host's account removes the 12-person limit. Guests always join free.",
			},
			{
				title: "Table QR cards",
				copy: "Print ready-made cards so every table can scan and share.",
			},
			{
				title: "Kept in full quality",
				copy: "Download the originals to keep long after the party.",
			},
		],
		faqs: [
			autoFindFaqEn,
			{
				q: "Does it work for guests with older phones?",
				a: "Guests can join from any phone with a browser by scanning the QR code. No app install needed.",
			},
			freeFaqEn,
			deletionFaqEn,
		],
		related: [
			"birthday-party-photos",
			"confirmation-photo-sharing",
			"bar-mitzvah-photo-sharing",
			"wedding-photo-sharing",
		],
	},
	{
		slug: "bar-mitzvah-photo-sharing",
		lang: "en",
		metaTitle: "Bar and Bat Mitzvah Photo Sharing | Recapd",
		metaDescription:
			"Collect every guest's photos from the bar or bat mitzvah party in one private album. Recapd finds them automatically. Join with a QR code.",
		kicker: "Bar and bat mitzvahs",
		h1: "Every hora, every speech, every guest's photos.",
		intro:
			"At the celebration, guests capture moments the photographer never sees. Recapd finds the photos and videos each guest took during the party and preselects them, so the family gets one private album from everyone who came.",
		cta: "Make the mitzvah album",
		points: [
			{
				title: "You choose the window",
				copy: "Set the event to the hours you want covered. Recapd only finds photos from that time.",
			},
			{
				title: "Join from any phone",
				copy: "Guests scan the QR code at the reception. No account needed.",
			},
			{
				title: "Private to the family",
				copy: "No feed and no public profiles. Only guests with the code can see it.",
			},
			{
				title: "Originals for the album",
				copy: "Download everything in full resolution in one tap.",
			},
		],
		faqs: [
			autoFindFaqEn,
			{
				q: "We have a photographer. Why use Recapd too?",
				a: "The photographer covers the planned moments. Guests catch the candid ones at their tables and on the dance floor, and Recapd collects those into one album.",
			},
			noAppFaqEn,
			deletionFaqEn,
		],
		related: [
			"confirmation-photo-sharing",
			"quinceanera-photo-sharing",
			"birthday-party-photos",
			"party-photo-sharing",
		],
	},
	{
		slug: "memorial-photo-sharing",
		lang: "en",
		metaTitle: "Funeral and Memorial Photo Sharing | Recapd",
		metaDescription:
			"A private, quiet way to gather photos from a memorial service or celebration of life. Guests join with a code. Nothing is posted publicly.",
		kicker: "Memorials",
		h1: "A private place for the photos from the day.",
		intro:
			"At a memorial or celebration of life, people sometimes take a few photos: the flowers, the family together, old friends meeting again. Recapd quietly finds those photos on each guest's phone and preselects them, so the family can gather them without having to ask anyone.",
		cta: "Make a private memorial album",
		points: [
			{
				title: "Private and quiet",
				copy: "No feed, no likes, no public page. Only people with the code can see the album.",
			},
			{
				title: "Nothing to ask for",
				copy: "Guests open Recapd and the photos from the day are already selected. They choose what to share.",
			},
			{
				title: "Easy for everyone",
				copy: "Guests join in the browser with a code. No account and no app needed.",
			},
			{
				title: "Download before it closes",
				copy: "The album is deleted 14 days after the event. Download everything in full resolution to keep.",
			},
		],
		faqs: [
			autoFindFaqEn,
			{
				q: "Can we make sure nothing is shared publicly?",
				a: "Yes. Recapd has no public feed or profiles. The album is visible only to the people you share the code with, and the host can remove any photo.",
			},
			noAppFaqEn,
			deletionFaqEn,
		],
		related: ["reunion-photo-sharing", "anniversary-party-photos", "qr-code-event-photos"],
	},
	{
		slug: "bryllup-bildedeling",
		lang: "nb",
		alternate: "wedding-photo-sharing",
		metaTitle: "Del bryllupsbilder med QR-kode | Recapd",
		metaDescription:
			"Recapd finner gjestenes bilder og videoer fra bryllupet og samler dem i ett privat album. Gjestene skanner en QR-kode, uten app og uten konto.",
		kicker: "Bryllup",
		h1: "Alle gjestenes bryllupsbilder, i ett album.",
		intro:
			"Fotografen tar de oppstilte bildene. Gjestene fanger dansegulvet, talene og øyeblikkene dere gikk glipp av. Recapd finner bildene på hver gjests mobil og velger dem ut på forhånd, så deling tar ett trykk. Sett en QR-kode på bordene og samle alt i ett privat album, i full kvalitet.",
		cta: "Lag bryllupsalbumet",
		points: [
			{
				title: "Finner bildene for deg",
				copy: "Recapd ser etter bilder tatt under bryllupet på hver gjests mobil. Gjestene ser over utvalget og trykker del.",
			},
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
			autoFindFaqNb,
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
		related: ["konfirmasjon-bilder", "bursdag-bilder", "fest-bilder"],
	},
	{
		slug: "julebord-bilder",
		lang: "nb",
		alternate: "christmas-party-photos",
		metaTitle: "Del bilder fra julebordet med QR-kode | Recapd",
		metaDescription:
			"Samle alle bildene fra julebordet i ett privat album. Recapd finner bildene på kollegaenes mobiler, og de deler med ett trykk. Uten konto.",
		kicker: "Julebord",
		h1: "Julebordet, sett fra alles mobil.",
		intro:
			"Alle tar bilder, men ingen deler dem. Recapd finner bildene hver kollega tok i løpet av julebordet og velger dem ut på forhånd. Sett QR-koden på bordet, så havner bildene i ett felles album i stedet for i femti private chatter.",
		cta: "Lag julebordsalbumet",
		points: [
			{
				title: "Bildene er allerede valgt ut",
				copy: "Recapd plukker ut bildene fra kvelden på hver mobil. Ett trykk for å dele.",
			},
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
			autoFindFaqNb,
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
		related: ["fest-bilder", "bursdag-bilder", "russ-bilder"],
	},
	{
		slug: "bursdag-bilder",
		lang: "nb",
		alternate: "birthday-party-photos",
		metaTitle: "Del bursdagsbilder i ett felles album | Recapd",
		metaDescription:
			"Recapd finner bildene fra bursdagen på hver gjests mobil og samler dem i ett privat album. Gjestene blir med via QR-kode, uten konto.",
		kicker: "Bursdag",
		h1: "Hele bursdagen, fra alles mobil.",
		intro:
			"Slutt å spørre «kan du sende meg det bildet?» i gruppechatten. Recapd finner bildene og videoene hver gjest tok i løpet av festen og velger dem ut på forhånd. Ett trykk, så havner alt i samme album.",
		cta: "Lag bursdagsalbumet",
		points: [
			{
				title: "Finner bildene for deg",
				copy: "Du setter start og slutt. Recapd plukker bare ut det som ble tatt i det tidsrommet.",
			},
			{
				title: "Kode eller QR-kode",
				copy: "Gjestene blir med via en kode på seks tegn eller ved å skanne QR-koden. Ingen konto.",
			},
			{
				title: "Video også",
				copy: "Kaken, talen og bursdagssangen havner i albumet i full kvalitet.",
			},
			{
				title: "Last ned alt",
				copy: "Lagre hele albumet på mobilen med ett trykk.",
			},
		],
		faqs: [
			autoFindFaqNb,
			{
				q: "Fungerer det på både iPhone og Android?",
				a: "Ja. Appen finnes på App Store og Google Play, og alle kan bli med i nettleseren.",
			},
			freeFaqNb,
			deletionFaqNb,
		],
		related: ["fest-bilder", "konfirmasjon-bilder", "bryllup-bildedeling"],
	},
	{
		slug: "fest-bilder",
		lang: "nb",
		alternate: "party-photo-sharing",
		metaTitle: "Del bilder fra festen med QR-kode | Recapd",
		metaDescription:
			"Alle tar bilder på fest, ingen deler dem. Recapd finner bildene på hver gjests mobil og samler dem i ett privat album. Gratis for opptil 12.",
		kicker: "Fest",
		h1: "Bildene fra festen finner veien selv.",
		intro:
			"Hjemmefest, vorspiel eller sommerfest. Alle filmer, ingen sender noe. Recapd ser gjennom kamerarullen til hver gjest etter bilder og videoer tatt mens festen pågikk, og velger dem ut på forhånd. Gjestene trykker del, og hele gjengen får alt i ett album.",
		cta: "Lag festalbumet",
		points: [
			{
				title: "Ingen leting i kamerarullen",
				copy: "Bare bildene fra festen blir valgt ut. Bilder fra før og etter holdes utenfor.",
			},
			{
				title: "Privat, uten feed",
				copy: "Ingen offentlig profil og ingen feed. Bare de med koden ser albumet.",
			},
			{
				title: "Video i full kvalitet",
				copy: "Klippene fra dansegulvet kommer i original kvalitet, ikke komprimert fra en chat.",
			},
			{
				title: "Last ned alt",
				copy: "Lagre hele albumet i full kvalitet med ett trykk.",
			},
		],
		faqs: [
			autoFindFaqNb,
			{
				q: "Kan vi ta med vorspiel og nachspiel?",
				a: "Ja. Sett starttid før vorset og sluttid etter nachspielet, så finner Recapd bilder fra hele kvelden.",
			},
			noAppFaqNb,
			freeFaqNb,
		],
		related: ["bursdag-bilder", "julebord-bilder", "russ-bilder", "17-mai-bilder"],
	},
	{
		slug: "konfirmasjon-bilder",
		lang: "nb",
		alternate: "confirmation-photo-sharing",
		metaTitle: "Del bilder fra konfirmasjonen | Recapd",
		metaDescription:
			"Samle alle bildene fra konfirmasjonsdagen i ett privat album. Recapd finner bildene på gjestenes mobiler. Bli med via QR-kode, uten app.",
		kicker: "Konfirmasjon",
		h1: "Konfirmasjonsdagen, sett fra hele familien.",
		intro:
			"Seremonien, middagen og talene. Tanter, besteforeldre og venner tar bilder av hver sin del av dagen. Recapd finner bildene hver gjest tok i løpet av konfirmasjonen og velger dem ut på forhånd, så konfirmanten får hele dagen samlet i ett album.",
		cta: "Lag konfirmasjonsalbumet",
		points: [
			{
				title: "Enkelt for besteforeldre",
				copy: "Skann QR-koden, se over bildene, trykk del. Ingen registrering.",
			},
			{
				title: "Talene på video",
				copy: "Videoklipp fra middagen havner sammen med bildene, i original kvalitet.",
			},
			{
				title: "QR-kort på bordene",
				copy: "Skriv ut ferdige bordkort, så kan alle gjestene dele fra plassen sin.",
			},
			{
				title: "Et minne i full kvalitet",
				copy: "Last ned hele albumet i full oppløsning med ett trykk.",
			},
		],
		faqs: [
			autoFindFaqNb,
			{
				q: "Passer det for både kirkelig og borgerlig konfirmasjon?",
				a: "Ja. Recapd bryr seg bare om når bildene ble tatt. Sett tidsrommet fra seremonien til festen er over.",
			},
			freeFaqNb,
			deletionFaqNb,
		],
		related: ["bursdag-bilder", "bryllup-bildedeling", "fest-bilder"],
	},
	{
		slug: "russ-bilder",
		lang: "nb",
		metaTitle: "Del russebilder i ett privat album | Recapd",
		metaDescription:
			"Russetiden gir tusenvis av bilder på hundre mobiler. Recapd finner bildene fra hvert treff og samler dem i ett privat album, uten feed.",
		kicker: "Russ",
		h1: "Russetiden, samlet. Ikke lagt ut.",
		intro:
			"Russetreff, slipp og 17. mai. Alle i gjengen filmer, men bildene blir liggende spredt på hver sin mobil. Lag et arrangement for hvert treff, så finner Recapd bildene og videoene tatt i det tidsrommet på hver mobil og velger dem ut. Ett trykk, og gjengen har alt.",
		cta: "Lag russealbumet",
		points: [
			{
				title: "Privat for gjengen",
				copy: "Ingen feed og ingen offentlige profiler. Bare de med koden ser albumet.",
			},
			{
				title: "Ett album per treff",
				copy: "Hvert arrangement får sin egen kode, så hvert treff får sitt eget album.",
			},
			{
				title: "Du sjekker før du deler",
				copy: "Bildene er valgt ut på forhånd, men du kan fjerne det du ikke vil dele.",
			},
			{
				title: "Last ned før det slettes",
				copy: "Albumet slettes 14 dager etter arrangementet. Lagre det du vil ha i full kvalitet.",
			},
		],
		faqs: [
			autoFindFaqNb,
			{
				q: "Hvor mange kan være med?",
				a: "Opptil 12 personer gratis. Med Pro på vertens konto er det ingen grense, og alle andre blir med gratis.",
			},
			{
				q: "Blir noe lagt ut offentlig?",
				a: "Nei. Recapd har ingen feed. Albumet er bare synlig for de som har koden, og verten kan fjerne hvilket som helst bilde.",
			},
			noAppFaqNb,
		],
		related: ["fest-bilder", "17-mai-bilder", "bursdag-bilder"],
	},
	{
		slug: "17-mai-bilder",
		lang: "nb",
		metaTitle: "Del bilder fra 17. mai i ett album | Recapd",
		metaDescription:
			"Toget, frokosten og is i solen. Recapd finner 17. mai-bildene på hele familiens mobiler og samler dem i ett privat album.",
		kicker: "17. mai",
		h1: "Hele nasjonaldagen, i ett familiealbum.",
		intro:
			"Barnetog, frokost med naboene, bunader og is. Alle tar bilder, men ingen får dem samlet. Lag et arrangement for dagen, så finner Recapd bildene og videoene hver gjest tok og velger dem ut. Ett trykk per person, og familien har hele 17. mai.",
		cta: "Lag 17. mai-albumet",
		points: [
			{
				title: "Fra frokost til kveld",
				copy: "Sett tidsrommet for hele dagen. Recapd finner alt som ble tatt i mellomtiden.",
			},
			{
				title: "Hele familien kan dele",
				copy: "Besteforeldre og naboer blir med via en kode, uten app og uten konto.",
			},
			{
				title: "Bunadsbilder i full kvalitet",
				copy: "Originalbilder, skarpe nok til å fremkalle.",
			},
			{
				title: "Privat",
				copy: "Bare de med koden ser albumet. Ingenting havner på sosiale medier.",
			},
		],
		faqs: [
			autoFindFaqNb,
			{
				q: "Kan vi lage album for både barnetoget og festen etterpå?",
				a: "Ja. Lag ett arrangement for hele dagen, eller ett for hver del. Hvert album får sin egen kode.",
			},
			noAppFaqNb,
			deletionFaqNb,
		],
		related: ["russ-bilder", "fest-bilder", "bursdag-bilder"],
	},
];

export function occasionBySlug(slug: string): Occasion {
	const occasion = occasions.find((item) => item.slug === slug);
	if (!occasion) throw new Error(`Unknown occasion: ${slug}`);
	return occasion;
}
