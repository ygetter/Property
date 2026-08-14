# Property Companion

A field-work companion app for property management agents — viewings, inspections, mileage/costs and reminders, synced with Monday.com.

Built with **Expo (React Native) + expo-router**, so one codebase runs on **Android**, **iOS** and the **web**.

## Features

### Home
- Today's and tomorrow's schedule pulled live from your Monday.com schedule board
- Quick links to every section

### Viewings
- Shows today's schedule items whose task type contains "Viewing"
- **Smart grouping**: `Unit 2, 128 Roehampton Vale…` + `Unit 3, 128 Roehampton Vale…` appear as one viewing: `Unit (2, 3), 128 Roehampton Vale…` (works for Flat / Room / Apartment too)
- **Task status buttons** on every viewing — **Complete / No show / Reschedule** — written straight back to the status column on the schedule board (all merged units are updated together)
- **Expected applicants**: the names in the schedule board's linked *Applicants* column are listed under each viewing. Tap a name to mark them as attended
- Open a viewing → search applicants by **name, email or mobile**. The search runs **server-side across the entire applicants board**, so it works with thousands of records (not just the first page)
- Applicant not found → **add them to Monday.com** straight from the app. New applicants always go into the **“To Check”** group
- Applicants with **subitems (pairs/joint applicants)** are added automatically
- **Times are converted from UTC to your local time**, so an 11:00 viewing shows as 11:00 during British Summer Time
- Only the **top rows of the schedule board are loaded** (85 by default, configurable) so the Home and Viewings tabs open fast
- Per applicant, two **+** buttons:
  - **Note** — saved to the applicant's *viewing notes* column on Monday.com (timestamped, appended)
  - **Status** — Good / Very Good / Not Good / Needs LL Ref / Needs Check → saved to the *viewing status* column
- **Daily report**: one tap builds a clean, modern PDF of the day's viewings — a KPI summary strip (viewings, applicants seen, expected, did not attend, attendance rate), a card per viewing with each applicant's outcome, contact details and notes, and a **follow-up table of everyone who was expected but did not attend with their phone and email**. Your email app opens with the PDF attached and recipients filled in (set them in Settings → Report & email)

### Inspections
- Build **editable inspection routines**: write each question, pick the answer type (entry box, yes/no, multiple choice, number, 1–5 rating) and pick what it's asked **for** (whole property, exterior, every unit, every bedroom, every kitchen, every bathroom, communal areas)
- Start an inspection → search a saved property → the questionnaire is **generated from the property's structure** (a 4-bed HMO asks bedroom questions 4×, kitchens/bathrooms repeat by count, flats with sub-rooms iterate correctly)
- Save progress or complete; records kept on device (ready for upload to your custom software)

### Accounts
- Daily **start/end mileage** with automatic miles-today calculation
- **Costs** (Blackwall Tunnel, parking, locks, anything else) — one tap emails the expense to accounts straight from the app

### Reminders
- Time-based and location-based reminders (e.g. "upload inspection to CRM")
- Push notifications / GPS geofencing hooks planned for the next iteration

### Settings
- **Monday.com connection**: API token, schedule board ID + column IDs (including the linked **Applicants** column), applicants board ID + column IDs, how many schedule rows to load, a UTC→local time toggle, and a connection test button
- **Properties**: add manually or **import from Excel/CSV** (columns: Address, Postcode, Type, Units, Kitchens, Bathrooms, Notes)
- **Structure builder**: model anything from a simple 6-bed HMO to a house containing two flats where one flat is a 2-bed and the other is a 4-bed HMO — units can contain sub-rooms, each with ensuite/kitchen/bathroom counts
- **Report & email**: daily report recipients, your name, company name

## Run it

```bash
npm install
npx expo start          # dev server (press w for web, a for Android emulator)
```

## Build the Android app (EAS)

```bash
npm install -g eas-cli
eas login
eas build --platform android --profile preview   # produces an APK you can install directly
# or: eas build --platform android --profile production  # AAB for Play Store
```

## Push to GitHub

```bash
git init
git add .
git commit -m "Property Companion v1"
git branch -M main
git remote add origin https://github.com/<your-username>/property-companion.git
git push -u origin main
```

## Monday.com setup guide

1. **API token**: Monday.com → your avatar (bottom left) → **Developers** → **My Access Tokens** → copy the token.
2. **Board ID**: open the board in a browser — the number in the URL: `monday.com/boards/1234567890`.
3. **Column ID**: on the board, click a column's **⋮** menu → **Column ID**. (If hidden, enable *Developer mode* in Monday Labs first.)

You need these column IDs:

| Board | Column | Example ID |
|---|---|---|
| Schedule | Task type (Viewing / Inspection…) | `text__1` |
| Schedule | Date & time | `date` |
| Schedule | Status (Complete / No show / Reschedule) | `status` |
| Schedule | Applicants (linked to the applicants board) | `board_relation` |
| Applicants | Email | `email` |
| Applicants | Mobile | `phone` |
| Applicants | Viewing status | `status__1` |
| Applicants | Viewing notes | `long_text` |

> **Note on the web preview**: browsers block direct browser→Monday.com calls (CORS). The compiled **Android app calls Monday.com directly with no proxy**. For web use, enter a CORS proxy prefix in Settings → Monday.com (e.g. `https://corsproxy.io/?url=`).

## Data & privacy

- Your Monday.com API token and all app data (properties, routines, mileage, reminders, attendance) are stored **only on your device** (AsyncStorage).
- Applicant notes and statuses, and viewing task statuses, are written directly to your Monday.com boards.

## Settings you may need to tune

| Setting | Default | What it does |
|---|---|---|
| Rows to load | `85` | How many schedule rows are pulled. The newest entries sit at the top of the board. Raise it if a viewing is missing. |
| Convert times from UTC | on | Monday.com stores times in UTC. Keep this on so times match your local clock. Turn it off only if times then show an hour late. |
| Applicants column ID | — | The linked column on the schedule board holding who said they would attend. Powers the expected-applicants list and the report's no-show table. |

---

## Accounts, costs & meter readings — setup guide

Everything in this section is on the **Accounts** tab (the £ icon).

### 1. Set your rates first (one time only)

Go to **Settings → Accounts & rates**, or **Accounts → Rates, charges & set items**.

- **Pay per mile** — set to `0.50`. Change it here any time; future reports use the new number.
- **Tolls & charges** — pre-filled with Blackwall Tunnel £4.00, Dart Crossing £2.50, Congestion Charge £15.00.
  Edit the amounts whenever they change, delete any you don't use, or add new ones with **Add a charge**.
- **Set items you install** — pre-filled with Lock change, Smoke alarm, Keys cut. These become one-tap
  buttons on the costs screen. Put the usual price in, or leave it at `0` to type the price each time.

Press **Save settings** at the bottom.

### 2. Set who each report goes to

**Settings → Report & email**:

| Field | What it is |
|---|---|
| Daily viewings report | Your manager / office |
| Mileage & charges report | Whoever is billed for travel |
| Costs & receipts | Your accountant |
| Meter readings | Office / whoever files them |
| Always CC | Optional — put your own address here to keep a copy |

Separate multiple addresses with commas. If you leave the mileage field blank it falls back to the
viewings recipients.

### 3. Log a day's driving

**Accounts → Daily mileage & visits**:

1. Check the date.
2. Type the **start mileage** and **end mileage** from the dashboard. The app shows the miles and the £ live.
3. Under **Properties visited**, search your saved property list and tap a property to add it. Use the
   **+** / **–** buttons to say how many times you were there that day. If it's not in your list, type it
   in **Other address** and press **Add**.
4. Under **Charges paid today**, tap **+** for each toll you paid (twice through the tunnel = 2).
5. **Save day.**

You can edit or delete any logged day from the list underneath.

### 4. How the split is worked out

Say you drove 200 miles at £0.50 = **£100**, and you visited 87 Oak Street once and 2 Johns Street 9 times
(10 visits total):

- 87 Oak Street = 1/10 × £100 = **£10.00**
- 2 Johns Street = 9/10 × £100 = **£90.00**

A repeat visit to the same property counts again, exactly as you asked.

**Tolls and charges work differently** — they are split equally between the *different* properties you
visited that day, not per visit. So £15 congestion charge on a day you saw 2 properties = £7.50 each,
however many times you went back.

### 5. The monthly mileage report

On the Accounts tab, pick the month with the arrows at the top. You'll see the miles, the mileage pay,
the tolls, and the total to recharge. Then:

- **Email the report** — builds the PDF and opens your email app with it attached.
- **Just make the PDF** — builds it and opens the Android share sheet so you can save it or send it anywhere.

The PDF has three parts: the headline totals, a **Total charge per property** table (a column for each
type of toll, plus the total due), and a **Day by day** section showing every day, its miles, its charges,
and each property's share.

### 6. Costs & receipts

**Accounts → Costs & receipts**:

1. Tap one of your **set item** buttons (Lock change, etc.) — it fills in the name and price for you.
   For anything else, just type what it was in the box.
2. Enter the amount, and pick which property it was for.
3. Add a note if the accountant needs to know something.
4. **Take photo** or **Choose photo** for the receipt.
5. **Save cost**, or **Save & email to accountant** — that builds a small cost sheet PDF and attaches the
   receipt photo to the email.

Every saved cost can be emailed later from the list, and gets an "Emailed" tag once you've sent it.

### 7. Meter readings

**Accounts → Meter readings**: pick the property, add as many photos as you need (**Take photo** repeatedly,
or **Choose photos** to select several at once), optionally type the numbers in the notes, then
**Save & email readings**. All the photos go on the email as attachments.

---

## How emailing works — important

The app never sends email on its own. When you tap any email button it:

1. Builds the PDF / gathers the photos,
2. Opens **your** email app with the recipients, subject, message and attachments already filled in,
3. You check it and press send — so the email genuinely comes **from your own address**.

**For this to work on your phone:**

- Install **Gmail** (or Outlook) and sign in to the address you want to send from.
- Set it as the default mail app: Android **Settings → Apps → Default apps → Email app**.
- The first time you attach a photo, Android asks for camera and photo permission — tap **Allow**.

**In the web preview only:** browsers can't attach files to an email draft. There, the PDF opens in the
print dialog (choose "Save as PDF") and a blank email draft opens separately. The compiled Android app
does the whole thing properly with attachments — so test emailing on the phone, not in the browser.

## What was fixed in this version

- **Applicant search** — the Monday.com query was rejecting the search value. It now sends the search
  correctly, and if your board doesn't allow server-side searching it automatically falls back to reading
  the board and filtering on the phone.
- **Adding an applicant** — email, phone and status columns need a special format in the Monday.com API.
  The app now reads your board's column types first and formats each value properly.
- **Viewings list** — the card now shows only "3 expected · 1 added". The actual names are inside the viewing.
- **Task status buttons** — now use the exact labels **Complete**, **No Show**, **To Rearrange**, and match
  your board's labels ignoring case and punctuation, so they always stick.
- **Daily report PDF** — much more compact, and each viewing is now a four-column table
  (applicant & group / contact details / outcome / notes) under a coloured header band.

## Update — Expected applicants, locations & Nearby properties

### Expected applicants are back (and more reliable)
- Every viewing screen now has an **"Expected at this viewing"** section at the bottom listing the names from the **Applicants column on your schedule board** — names only, nothing else.
- **Tap a name to add that person to the viewing.** The app then looks them up on your applicants board (by ID first, then by name) so you can set Good / Very Good / Not Good / Needs LL Ref / Needs Check and type notes straight back to Monday.com.
- If Monday sends only a name with no linked item, the app fetches the real item so statuses and notes still save. If the person genuinely isn't on the applicants board, they're marked **"Name only"** — you can still record attendance, and the app tells you why notes can't sync.
- The section is always visible. If it's empty it tells you to check the **Applicants column ID** in Settings → Monday.com and pull down to refresh.
- Expected names are cached on the phone, so opening a viewing works even with a poor signal.

### Daily PDF report
- Inside **each viewing** the people who were expected but didn't turn up now appear as their own rows marked **"Did not attend"**.
- At the **bottom of the report** there's a **Follow-up — did not attend** table with every no-show for the day, plus their mobile and email and which viewing they missed, so you can chase them in one go.
- No-shows are matched by applicant ID *or* by name, so nobody gets double-counted.

### Property locations
- Settings → Properties → open any property → **Location** card:
  - **Use postcode** — looks the postcode up automatically (free UK postcode service, no account needed).
  - **I'm here now** — saves your current GPS position while you're standing at the property.
  - **Clear** — removes the saved location.
- On the Properties list, each property shows a **Located** or **No location** chip, and there's a **"Find locations from postcodes"** button that geocodes every property that's missing one in a single tap.

### Nearby properties (home screen)
- Home screen → **Nearby properties**.
- Uses your current location and lists every property with a saved location, closest first, with the distance in miles.
- Distance filters: 1 / 3 / 5 / 10 miles or All.
- **Directions** opens the property in Google Maps; **Property details** opens its record.
- Properties without a location are called out with a shortcut to fix them.
- Android will ask for location permission the first time (permission text is already set in `app.json`).

## Expected applicants — how the app finds them (updated)

The app no longer relies on you getting the Applicants column ID right. Every time it loads
today's viewings it tries three things in order:

1. **The Applicants column you set** in Settings → Monday.com (if you set one).
2. **Auto-detect** — it reads the column list of the schedule board and tries every other
   column that could hold applicants (connect boards, dependency, mirror, people, dropdown,
   text, long text), skipping the task/date/status columns you already mapped. Columns whose
   title mentions applicant / attendee / viewer / candidate / tenant / guest / name are tried first.
3. **The other direction** — if the "connect boards" column lives on the *applicants* board
   instead (one-way links only exist on one side), the app reads the applicants board, finds the
   column pointing back at the schedule board, and matches each applicant to their viewing.

Because of step 2 you can leave the Applicants column field blank.

### Find applicants column (Settings → Monday.com, or the viewing empty state)

A diagnostic screen that reads the first 25 rows of the schedule board and lists **every**
column with its type, its ID, a sample of what it actually contains, and how many real names
were spotted. Tap **Use this one** to save it as the Applicants column. Names are only counted
when they look like people (capitalised, up to 3 words, no digits, not a status word), so dates,
task types and notes are not mistaken for applicants.

If nothing shows names, the applicants are almost certainly linked from the applicants board
side only — step 3 handles that, so pull down to refresh on the Viewings tab.

Each viewing screen also shows **Last check: …**, a one-line note saying which of the three
routes produced the names (or why none did).
