import { appendFileSync } from 'fs';
import { Result, err, ok } from 'neverthrow';
import { Rettiwt, Tweet } from 'rettiwt-api';

type ExportableTweet = {
	fullText: string;
};

type TweetParseError = { type: 'NotAuthored'; message: string };

const rettiwt = new Rettiwt({
	apiKey:
		'',
});

function processTweet(tweet: Tweet): Result<ExportableTweet, TweetParseError> {
	if (tweet.retweetedTweet) {
		return err({ type: 'NotAuthored', message: 'skipping retweeted tweets' });
	}
	const { fullText } = tweet;

	return ok({ fullText });
}

let tweetCount = 0;
let cursor: string | undefined = undefined;

while (tweetCount < 500) {
	const data = await rettiwt.tweet.search(
		{
			fromUsers: ['DrNotavel'],
			top: true,
		},
		20,
		cursor,
	);

	const items = data.list
		.map((elem) => processTweet(elem))
		.filter((res) => res.isOk())
		.map((r) => r._unsafeUnwrap());

	tweetCount += items.length;

	appendFileSync('data/tweets.json', JSON.stringify(items) + '\n');

	console.log(`${items.length} tweets written - total accumulated tweet count ${tweetCount}`);

	cursor = data.next;
}
