import "dotenv/config";
import connectDB from "./src/config/mongodb.js";
import Song from "./src/models/songModel.js";
import Album from "./src/models/albumModel.js";

async function seed() {
  await connectDB();

  console.log("🧹 Clearing existing records...");
  await Song.deleteMany({});
  await Album.deleteMany({});

  const sampleSongs = [
    {
      name: "Example Song 1",
      desc: "A sample song for seeding the database",
      album: "Example Album",
      artist: "Artist A",
      genre: "Pop",
      image: "https://via.placeholder.com/300",
      file: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
      duration: "3:45",
    },
    {
      name: "Example Song 2",
      desc: "Another sample track",
      album: "Example Album",
      artist: "Artist B",
      genre: "Rock",
      image: "https://via.placeholder.com/300",
      file: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
      duration: "4:10",
    },
  ];

  const sampleAlbums = [
    {
      name: "Example Album",
      desc: "A sample album used for seeding",
      bgColor: "#000000",
      image: "https://via.placeholder.com/500",
    },
  ];

  const songs = await Song.insertMany(sampleSongs);
  const albums = await Album.insertMany(sampleAlbums);

  console.log(`✅ Inserted ${songs.length} songs and ${albums.length} albums.`);
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});