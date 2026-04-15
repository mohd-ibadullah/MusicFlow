const base = "http://127.0.0.1:4002";

const parseJson = async (response) => {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
};

const email = `ld.e2e.${Date.now()}@test.com`;
const password = "Test12345!";
const name = "LD E2E";

const registerResponse = await fetch(`${base}/api/auth/register`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name, email, password }),
});
const registerData = await parseJson(registerResponse);

if (!registerData.success) {
  console.log("REGISTER_FAIL", registerData);
  process.exit(1);
}

const token = registerData.data.token;
let userId = null;

if (registerData.data && registerData.data.user) {
  if (registerData.data.user._id) {
    userId = registerData.data.user._id;
  } else if (registerData.data.user.id) {
    userId = registerData.data.user.id;
  }
}

if (!userId && token) {
  try {
    const payloadPart = token.split(".")[1];
    const payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8"));
    if (payload && payload.userId) {
      userId = payload.userId;
    }
  } catch {
    // no-op: handled by validation below
  }
}

if (!userId) {
  console.log("NO_USER_ID", registerData);
  process.exit(1);
}

const songsResponse = await fetch(`${base}/api/song/list`);
const songsData = await parseJson(songsResponse);
const songs = Array.isArray(songsData.data) ? songsData.data : [];
const firstSong = songs[0];
if (!firstSong || !firstSong._id) {
  console.log("NO_SONGS");
  process.exit(1);
}
const songId = firstSong._id;

const playBody = { listenerId: userId, userName: name };

const play1Response = await fetch(`${base}/api/song/play/${songId}`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(playBody),
});
console.log("PLAY1", await parseJson(play1Response));

await new Promise((resolve) => setTimeout(resolve, 11000));

const play2Response = await fetch(`${base}/api/song/play/${songId}`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(playBody),
});
console.log("PLAY2", await parseJson(play2Response));

const findPendingIntervention = async () => {
  const maxAttempts = 8;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const historyResponse = await fetch(`${base}/api/loop-diagnosis/history`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const historyData = await parseJson(historyResponse);
    const events = Array.isArray(historyData.events) ? historyData.events : [];
    const pending = events.find((event) => event.interventionStatus === "triggered");

    if (pending || attempt === maxAttempts) {
      return pending || null;
    }

    await new Promise((resolve) => setTimeout(resolve, 750));
  }

  return null;
};

const pending = await findPendingIntervention();

console.log(
  "E2E_CTX",
  JSON.stringify(
    {
      email,
      password,
      token,
      userId,
      songId,
      pendingEventId: pending ? pending._id : null,
      pendingType: pending ? pending.interventionType : null,
      pendingCategory: pending ? pending.triggerCategory : null,
    },
    null,
    2,
  ),
);
