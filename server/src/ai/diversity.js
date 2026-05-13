const MAX_PER_ARTIST = 2;

const normalizeText = (value) =>
  typeof value === "string" && value.trim() ? value.trim().toLowerCase() : "";

const canTakeCandidate = ({
  artistCount,
  genreCount,
  artist,
  genre,
  maxPerArtist,
  maxPerGenre,
  enforceArtist,
  enforceGenre,
}) => {
  if (enforceArtist && artist && (artistCount.get(artist) || 0) >= maxPerArtist) {
    return false;
  }

  if (enforceGenre && genre && (genreCount.get(genre) || 0) >= maxPerGenre) {
    return false;
  }

  return true;
};

export function diversifyRankedRecommendations(scoredCandidates, limit) {
  if (!Array.isArray(scoredCandidates) || scoredCandidates.length === 0) return [];

  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 100);
  const maxPerGenre = Math.max(1, Math.ceil(safeLimit / 3));

  const selected = [];
  const selectedIds = new Set();
  const artistCount = new Map();
  const genreCount = new Map();

  const passes = [
    { enforceArtist: true, enforceGenre: true },
    { enforceArtist: true, enforceGenre: false },
    { enforceArtist: false, enforceGenre: false },
  ];

  for (const pass of passes) {
    if (selected.length >= safeLimit) break;

    for (const candidate of scoredCandidates) {
      if (!candidate || selected.length >= safeLimit) break;

      const songId = candidate.song?._id?.toString?.();
      if (!songId || selectedIds.has(songId)) continue;

      const artist = normalizeText(candidate.song?.artist);
      const genre = normalizeText(candidate.song?.genre);

      if (
        !canTakeCandidate({
          artistCount,
          genreCount,
          artist,
          genre,
          maxPerArtist: MAX_PER_ARTIST,
          maxPerGenre,
          enforceArtist: pass.enforceArtist,
          enforceGenre: pass.enforceGenre,
        })
      ) {
        continue;
      }

      selected.push(candidate);
      selectedIds.add(songId);
      if (artist) {
        artistCount.set(artist, (artistCount.get(artist) || 0) + 1);
      }
      if (genre) {
        genreCount.set(genre, (genreCount.get(genre) || 0) + 1);
      }
    }
  }

  return selected;
}
