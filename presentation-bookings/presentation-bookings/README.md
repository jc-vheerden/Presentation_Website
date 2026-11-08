# Presentation Bookings

A web app where students book a time slot to present their work, and the lecturer opens presentation days with a set presentation length, a 5-minute changeover, optional breaks and a venue. Data is stored in your own Firebase project.

## What's in this folder

```
presentation-bookings/
├── public/                  The website (this is the folder you upload)
│   ├── index.html           Student booking page  (share this link)
│   ├── lecturer.html        Lecturer page         (keep this link to yourself)
│   ├── css/
│   │   └── styles.css       Colours, fonts and layout
│   └── js/
│       ├── firebase-config.js  Your Firebase settings and lecturer email  ← YOU EDIT THIS
│       ├── app.js           Starts the app on both pages, watches sign-in, redraws
│       ├── firebase.js      All sign-in and database calls
│       ├── auth.js          The sign-in screen
│       ├── lecturer.js      Lecturer view: open days, breaks, manage bookings
│       ├── student.js       Student view: book and cancel slots
│       ├── components.js    Parts shared by both views
│       ├── state.js         The app's shared data
│       ├── time.js          Date/time helpers and slot calculation
│       └── ui.js            Small page helpers (pop-ups, messages)
├── firestore.rules          Who may read and change data  ← YOU EDIT THE EMAIL
├── firebase.json            Settings for Firebase Hosting
└── README.md
```

## Open it in Visual Studio Code

1. Unzip the folder.
2. In VS Code: **File > Open Folder…** and choose `presentation-bookings`.
3. Install the **Live Server** extension (by Ritwick Dey) from the Extensions panel. You need it for testing, because the JavaScript files load each other and that only works through a web server.

## 1. Set up Firebase (once)

1. Go to <https://console.firebase.google.com>, click **Create a project**, name it (e.g. `presentation-bookings`). Google Analytics can be off.
2. On the project home page click the **</>** (Web) icon, give it a nickname and click **Register app**. Copy the `firebaseConfig` values it shows.
3. **Build > Authentication > Get started**. Under **Sign-in method** turn on **Google** and **Email/Password**.
4. **Build > Firestore Database > Create database**. Pick the location closest to you (it can't be changed later) and start in **production mode**.
5. In Firestore open the **Rules** tab, paste in the contents of `firestore.rules` (with your email filled in) and click **Publish**.

## 2. Add your settings

Open `public/js/firebase-config.js` in VS Code:

- Replace the `firebaseConfig` values with the ones you copied in step 1.2.
- Set `LECTURER_EMAIL` to your Google email.

Open `firestore.rules` and put the same email in place of `YOUR_EMAIL@gmail.com`. If you change the rules later, paste them into the Firebase console again and publish.

> **Sign in as the lecturer with Google** (not email and password). The app only trusts the lecturer email when Google has confirmed it belongs to you.

## 3. Test it on your computer

The app must be opened through a web server. Double-clicking `index.html` will show a blank page.

1. In VS Code, right-click `public/lecturer.html` and choose **Open with Live Server**.
2. It opens at an address like `http://127.0.0.1:5500`. In Firebase go to **Authentication > Settings > Authorized domains**, click **Add domain** and add `127.0.0.1` (`localhost` is already there).
3. Sign in with Google using your lecturer email. You'll see the lecturer view.
4. To test as a student, open the same address but ending in `index.html` in a private/incognito window, and create an account with another email.

## 4. Put it online

**Option A: Netlify (no installing)**

1. Go to <https://app.netlify.com/drop> and drag the `public` folder onto the page.
2. Copy the address it gives you (e.g. `your-site.netlify.app`).
3. In Firebase: **Authentication > Settings > Authorized domains > Add domain**, paste the address.

**Option B: Firebase Hosting (uses the VS Code terminal)**

1. Install Node.js from <https://nodejs.org> (the LTS version).
2. In VS Code open **Terminal > New Terminal** and run:

   ```
   npm install -g firebase-tools
   firebase login
   firebase use --add
   firebase deploy
   ```

   At `firebase use --add` choose your project. `firebase deploy` uploads the site **and** publishes `firestore.rules`.
3. Your site is at `https://YOUR-PROJECT-ID.web.app`. This address is already authorised for sign-in.

Share the **booking page** link with your students (the address ending in `/` or `/index.html`).
Keep the **lecturer page** (`/lecturer.html`) for yourself. Even if a student finds it, they only see "This page is for the lecturer".

## How it works

- **Lecturer page** (`lecturer.html`): only works for your email, signed in with Google. Open presentation days with a date, time window, presentation length, changeover (5 minutes by default), breaks and venue. See who booked each slot with their student number and title, remove bookings, change the venue, copy the schedule or delete a day.
- **Booking page** (`index.html`): students sign in, see upcoming days, book one open slot per day with their name, student number and project title, and cancel their own booking.
- **Privacy:** taken slots only show "Booked" to students. Names, student numbers and titles are stored separately, and the database rules only let you and the student who booked read them.
- Bookings show up for everyone straight away. Two students can't book the same slot.
- Breaks are set when a day is created. To change breaks on a day that's already open, delete the day and create it again.

## Costs

Firebase's free **Spark** plan covers a class easily (tens of thousands of reads per day). You don't need to add a credit card.
