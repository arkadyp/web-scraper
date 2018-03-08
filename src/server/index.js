import request from 'request';
import cheerio from 'cheerio';
import {promisify} from 'util';
import flatten from 'just-flatten-it';
import qs from 'querystring';
import get from 'just-safe-get';
import uuidv4 from 'uuid/v4';

class WebsiteFetcher {
  constructor() {
    this.request = promisify(request);
  }

  fetchUrl(url) {
    return this.request(url);
  }
}

/*------------------------------------------------------------------------------------------------*/
// Main Thread
class WhoSampledService {
  constructor() {
    this.websiteFetcher = new WebsiteFetcher();
    this.baseURL = 'https://www.whosampled.com';
    this.request = promisify(request);
  }

  async parseWebsite(url) {
    const website = await this.websiteFetcher.fetchUrl(url);
    return cheerio.load(website.body)
  }

  async getSongUrlsFromAlbum(url) {
    const $ = await this.parseWebsite(url);
    const urls = [];
    $('.trackName').map((i,e) => urls.push(`${this.baseURL}${$(e).children().attr('href')}`));
    return urls;
  }

  async getSamplesForSong(url) {
    const $ = await this.parseWebsite(url);
    if ($('.sectionHeader').first().text().indexOf('Contains samples') === -1) {
      return [];
    }

    const data = [];
    const parent = $('.sectionHeader').first().parent().children().eq(1)
    $(parent).find('.trackName').each((i, e) => {
      data.push({trackName: $(e).text()});
    });
    $(parent).find('.trackArtist').each((i, e) => {
      const artist = $(e).text();
      data[i].artist = artist.slice(3, artist.indexOf(' ('));
      data[i].source = url;
    });
    return data;
  }
}

/*------------------------------------------------------------------------------------------------*/
// Spotify Service
class SpotifyService {
  constructor({clientId, clientSecret}) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.authToken = null;
    this.request = promisify(request);
    this.personalAccessToken = 'BQATO3zK_oa206XmHDzivmN4oD9JdkWXCjTmJMeO1sfA3TKLBRYi-9evPAkQPeH4GiST4UU1RcHXo5SCa7VfZQeEetDYH25p1dHhIL19vdgyHutRFYLrmMi4yBvM6EVQsgCp3MhvouXYn3G5u4bWlSng2TjRudIQ3XZxCwxvLpjFAw&';
    this.playlistId = '4IAUZZnI9YMMQNYGo3l3az';
  }

  async getClientCredentialsToken() {
    const clientAuthString = new Buffer(this.clientId + ':' + this.clientSecret).toString('base64');
    var authOptions = {
      method: 'POST',
      url: 'https://accounts.spotify.com/api/token',
      headers: {
        Authorization: `Basic ${clientAuthString}`
      },
      form: {
        grant_type: 'client_credentials'
      },
      json: true
    };
    try {
      const response = await this.request(authOptions);
      if (response.statusCode === 200) {
        this.authToken = response.toJSON().body.access_token;
        return this.authToken;
      }
      throw new Error('failed to authenticate');
    } catch (e) {
      console.log('********** error making request');
      console.log(e);
      throw new Error('failed to authenticate');
    }
  }

  async searchForSong({artist, trackName, uuid}) {
    console.log(`========= seaching for song: ${artist} - ${trackName}`);
    if (!this.authToken) {
      return null;
    }
    try {
      const queryOptions = {
        q: `${artist} ${trackName}`,
        type: 'track'
      };
      const requestOptions = {
        url: `https://api.spotify.com/v1/search?${qs.stringify(queryOptions)}`,
        headers: {
          Authorization: `Bearer ${this.authToken}`
        }
      };
      const response = await this.request(requestOptions);
      const data = JSON.parse(response.toJSON().body);
      
      const track = data.tracks.items[0];
      return {
        spotifyUri: get(track, 'uri') || null,
        spotifyId: get(track, 'id') || null,
        uuid,
      };
    } catch (e) {
      console.log('********** error searching for song');
      console.log(e);
      throw new Error('failed to search for song');
    }
  }

  async getUser() {
    console.log('========= fetching user');
    const requestOptions = {
      url: 'https://api.spotify.com/v1/me',
      headers: {
        Authorization: `Bearer ${this.personalAccessToken}`
      }
    };
    const response = await this.request(requestOptions);
    return response.toJSON().body;
  }

  async createPlaylist({userId}) {
    try {
      const requestOptions = {
        method: 'POST',
        url: `https://api.spotify.com/v1/users/${userId}/playlists`,
        headers: {
          Authorization: `Bearer ${this.personalAccessToken}`
        },
        body: {
          name: 'FUN PLAYLIST FOR KATE!',
          description: 'I WILL BE HAPPY IF THIS WORKS!',
          public: false
        },
        json: true,
      };
      const response = await this.request(requestOptions);
      return response.toJSON().body;
    } catch (e) {
      console.log('---------- failed to make playlist');
      console.log(e);
      return null;
    }
  }

  async addSongsToPlaylist({userId, uris}) {
    console.log('========= adding songs to playlist:');
    console.log(userId);
    console.log(uris);
    try {
      const requestOptions = {
        method: 'POST',
        url: `https://api.spotify.com/v1/users/${userId}/playlists/${this.playlistId}/tracks`,
        headers: {
          Authorization: `Bearer ${this.personalAccessToken}`
        },
        body: {
          uris,
        },
        json: true,
      };
      const response = await this.request(requestOptions);
      return response.toJSON().body;
    } catch (e) {
      console.log('---------- failed to add song to playlist');
      console.log(e);
      return null;
    }
  }
}

/*------------------------------------------------------------------------------------------------*/
// Main Thread

// Constants
const ALBUM_URLS = [
  'https://www.whosampled.com/album/Kanye-West/The-College-Dropout/',
  'https://www.whosampled.com/album/Kanye-West/Graduation/',
  'https://www.whosampled.com/album/Kanye-West/Yeezus/',
  'https://www.whosampled.com/album/Jay-Z/Watch-The-Throne/',
  'https://www.whosampled.com/album/Kanye-West/The-Life-Of-Pablo/',
  'https://www.whosampled.com/album/Kanye-West/Late-Registration/',
];

// TODO: read from secrets.json
const SPOTIFY_CLIENT_ID = '';
const SPOTIFY_CLIENT_SECRET = '';

async function mainThread() {
  try {
    // Init App
    const whoSampledService = new WhoSampledService();
    const spotifyService = new SpotifyService({
      clientId: SPOTIFY_CLIENT_ID,
      clientSecret: SPOTIFY_CLIENT_SECRET
    });
    const spotifyClientCredentials = await spotifyService.getClientCredentialsToken();

    const user = await spotifyService.getUser();
    const userId = JSON.parse(user).id;

    // const playlist = await spotifyService.createPlaylist({userId});
    // console.log('----------');
    // console.log(playlist);

    // Get song data from Who Samples
    let urlsOfSampledSongs = await Promise.all(ALBUM_URLS.map(url => whoSampledService.getSongUrlsFromAlbum(url)));
    urlsOfSampledSongs = flatten(urlsOfSampledSongs)

    const nestedSamplesData = await Promise.all(urlsOfSampledSongs.map(url => whoSampledService.getSamplesForSong(url)));
    const samplesData = flatten(nestedSamplesData)
      .reduce((memo, data) => {
        const uuid = uuidv4();
        memo[uuid] = {uuid, ...data};
        return memo;
      }, {});


    const spotifyTracks = await Promise.all(
      Object.keys(samplesData)
        .map(uuid => samplesData[uuid])
        .map(({...args}) => spotifyService.searchForSong(args))
    );
    spotifyTracks.forEach(({uuid, spotifyId, spotifyUri}) => {
      samplesData[uuid] = {
        ...samplesData[uuid],
        spotifyUri,
        spotifyId,
      }
    });

    console.log(spotifyTracks);

    // const spotifyUris = Object.keys(samplesData)
    //   .map(uuid => samplesData[uuid].spotifyUri)
    //   .filter((uri) => Boolean(uri))
    
    // const addedSongs = await spotifyService.addSongsToPlaylist({uris: spotifyUris, userId});
    // console.log(addedSongs);

  } catch(e) {
    console.log(e);
  }
}
mainThread();

// https://accounts.spotify.com/authorize?scope=playlist-modify-private&client_iud=ab4e42b2298a4860b24f32c35043c1dc&response_type=token&redirect_uri=localhost%3A3000%2Fcb


