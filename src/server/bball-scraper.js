import cheerio from 'cheerio';
import request from 'request';
import {promisify} from 'util';
import zip from 'just-zip-it';

class WebsiteFetcher {
  constructor() {
    this.request = promisify(request);
  }

  fetchUrl(url) {
    return this.request(url);
  }
}

class CBSBasketballService {
  constructor() {
    this.websiteFetcher = new WebsiteFetcher();
    this.baseURL = 'https://www.cbssports.com/college-basketball/scoreboard/all/';
    this.request = promisify(request);
  }

  async parseWebsite(url) {
    const website = await this.websiteFetcher.fetchUrl(url);
    return cheerio.load(website.body)
  }

  async getScores(date) {
    const url = `${this.baseURL}/${date}`
    const $ = await this.parseWebsite(url);

    const home = [];
    const away = [];
    $('.single-score-card .team .team').map((i,e) => {
      const team = i % 2 === 0 ? home : away;
      team.push({
        name: e.children[0].data,
        score: e.parent.parent.children[6].children[0].data,
      });
    });

    return zip(home, away).map((res) => ({
      home: res[0],
      away: res[1]
    }));
  }
}

async function mainThread() {
  const cbsBasketballService = new CBSBasketballService();
  const result = await cbsBasketballService.getScores('20180307');
  console.log(result);
}
mainThread();

