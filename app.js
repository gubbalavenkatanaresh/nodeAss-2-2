const express = require("express");
const path = require("path");

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

//API-1

app.post("/register/", async (request, response) => {
  const { name, username, password, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  console.log(hashedPassword);
  const selectUserQuery = `
    SELECT *
    FROM user
    WHERE username= '${username}'`;
  const dbResponse = await db.get(selectUserQuery);
  if (dbResponse !== undefined) {
    response.status(400);
    response.send("User already exists");
  } else {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const registerQuery = `
            INSERT INTO
              user(name, username, password, gender)
            VALUES 
              (
                  '${name}',
                  '${username}',
                  '${hashedPassword}',
                  '${gender}'
              );`;
      await db.run(registerQuery);
      response.send("User created successfully");
    }
  }
});

//API-2

app.post("/login", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

//API-3

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}'`;
  const { user_id } = await db.get(getUserIdQuery);
  const getUsersQuery = `
    SELECT user.username AS username,
    tweet.tweet AS tweet,
    tweet.date_time AS dateTime
    FROM user INNER JOIN tweet ON user.user_id=tweet.user_id
    WHERE user.user_id IN (SELECT following_user_id FROM follower WHERE follower_user_id=${user_id})
    ORDER BY date_time DESC
    LIMIT 4
    `;
  const dbResponse = await db.all(getUsersQuery);
  response.send(dbResponse);
});

//API-4

app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}'`;
  const { user_id } = await db.get(getUserIdQuery);
  const getFollowingQuery = `
   SELECT name
    FROM user
    WHERE user_id IN (SELECT following_user_id FROM follower WHERE follower_user_id=${user_id})
    `;
  const followingUsers = await db.all(getFollowingQuery);
  response.send(followingUsers);
});

//API-5

app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}'`;
  const { user_id } = await db.get(getUserIdQuery);
  const getFollowersQuery = `
   SELECT name
    FROM user
    WHERE user_id IN (SELECT follower_user_id FROM follower WHERE following_user_id=${user_id})
    `;
  const followers = await db.all(getFollowersQuery);
  response.send(followers);
});

//API-6

app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { username } = request;
  const { tweetId } = request.params;
  const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}'`;
  const { user_id } = await db.get(getUserIdQuery);
  const tweetUserIdQuery = `SELECT user_id FROM tweet WHERE tweet_id = ${tweetId}`;
  const getTweetUserId = await db.get(tweetUserIdQuery);
  const tweetUserId = getTweetUserId.user_id;
  const getFollowerTweetOrNotQuery = `
  SELECT * FROM follower WHERE follower_user_id=${user_id} AND following_user_id = ${tweetUserId}
  `;
  const followerOrNot = await db.all(getFollowerTweetOrNotQuery);
  if (followerOrNot.length === 0) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const getTweetDetailsQuery = `
      SELECT tweet,
      (SELECT count(*) FROM like WHERE tweet_id=${tweetId}) AS likes,
      (SELECT count(*) FROM reply WHERE tweet_id=${tweetId}) AS replies,
      date_time AS dateTime
      FROM tweet
      WHERE tweet_id=${tweetId}`;
    const tweetDetails = await db.get(getTweetDetailsQuery);
    response.send(tweetDetails);
  }
});

//API-7

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}'`;
    const { user_id } = await db.get(getUserIdQuery);
    const tweetUserIdQuery = `SELECT user_id FROM tweet WHERE tweet_id = ${tweetId}`;
    const getTweetUserId = await db.get(tweetUserIdQuery);
    const tweetUserId = getTweetUserId.user_id;
    const getFollowerTweetOrNotQuery = `
  SELECT * FROM follower WHERE follower_user_id=${user_id} AND following_user_id = ${tweetUserId}
  `;
    const followerOrNot = await db.all(getFollowerTweetOrNotQuery);
    if (followerOrNot.length === 0) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const getLikedUsernameQuery = `
      SELECT username FROM user WHERE user_id IN (SELECT user_id FROM like WHERE tweet_id = ${tweetId})`;
      const likesUsernames = await db.all(getLikedUsernameQuery);
      var likedUsernames = [];
      likesUsernames.map((each) => {
        likedUsernames.push(each.username);
      });
      response.send({ likes: likedUsernames });
    }
  }
);

//API-8

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}'`;
    const { user_id } = await db.get(getUserIdQuery);
    const tweetUserIdQuery = `SELECT user_id FROM tweet WHERE tweet_id = ${tweetId}`;
    const getTweetUserId = await db.get(tweetUserIdQuery);
    const tweetUserId = getTweetUserId.user_id;
    const getFollowerTweetOrNotQuery = `
  SELECT * FROM follower WHERE follower_user_id=${user_id} AND following_user_id = ${tweetUserId}
  `;
    const followerOrNot = await db.all(getFollowerTweetOrNotQuery);
    if (followerOrNot.length === 0) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const getRepliesQuery = `
      SELECT user.username AS name,
       reply.reply
      FROM user INNER JOIN reply ON user.user_id=reply.user_id
      WHERE reply.tweet_id = ${tweetId}`;
      const replies = await db.all(getRepliesQuery);
      response.send({ replies: replies });
    }
  }
);

//API-9

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}'`;
  const { user_id } = await db.get(getUserIdQuery);
  const userTweetIdsQuery = `SELECT tweet_id FROM tweet WHERE user_id = ${user_id}`;
  const userTweetIds = await db.all(userTweetIdsQuery);
  let tweets = [];
  await userTweetIds.map(async (each) => {
    const { tweet_id } = each;
    const getTweetDetailsQuery = `
      SELECT tweet,
      (SELECT count(*) FROM like WHERE tweet_id=${tweet_id}) AS likes,
      (SELECT count(*) FROM reply WHERE tweet_id=${tweet_id}) AS replies,
      date_time AS dateTime
      FROM tweet
      WHERE tweet_id=${tweet_id}
      `;
    const tweetDetails = await db.get(getTweetDetailsQuery);
    tweets.push(tweetDetails);
  });
  response.send(tweets);
});

//API-10

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;
  const { tweet } = request.body;
  const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}'`;
  const { user_id } = await db.get(getUserIdQuery);
  const dateTime = new Date();
  const insertTweetQuery = `
  INSERT INTO
    tweet(tweet, user_id, date_time)
  VALUES
    (
        '${tweet}',
        ${user_id},
        '${dateTime}'
    )`;
  await db.run(insertTweetQuery);
  response.send("Created a Tweet");
});

//API-11

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const getUserIdQuery = `SELECT user_id FROM user WHERE username='${username}'`;
    const { user_id } = await db.get(getUserIdQuery);
    const checkTweetQuery = `
  SELECT * FROM tweet WHERE user_id=${user_id} AND tweet_id=${tweetId}`;
    const userTweet = await db.all(checkTweetQuery);
    if (userTweet.length === 0) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const deleteQuery = `
        DELETE FROM
          tweet
        WHERE tweet_id=${tweetId}
        `;
      await db.run(deleteQuery);
      response.send("Tweet Removed");
    }
  }
);

module.exports = app;
