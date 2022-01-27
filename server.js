const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const knex = require("knex");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const app = express();

var corsOptions = {
  origin: "http://localhost:3000",
  optionsSuccessStatus: 200,
  credentials: true,
};

app.use(cookieParser());
app.use(cors(corsOptions));
app.use(
  express.urlencoded({
    extended: true,
  })
);
app.use(express.json());

//This data will be put in an enviroment file
const db = knex({
  client: "pg",
  connection: {
    host: "127.0.0.1",
    user: "todolist",
    password: "test",
    database: "to-do-list",
  },
});

function jwtGenerator(user_id) {
  const payload = {
    user: {
      id: user_id,
    },
  };

  return jwt.sign(payload, "supersecret123", { expiresIn: 600 });
}

app.use(async function (req, res, next) {
  if (req.originalUrl === "/signin") {
    next();
  } else if (req.originalUrl === "/register") {
    next();
  } else {
    const jwtToken = req.cookies.webtoken;
    if (jwtToken) {
      try {
        const verifyToken = await jwt.verify(jwtToken, "supersecret123");

        if (verifyToken) {
          req.user_data = verifyToken;
          next();
        } else {
          res.send("Token not exisiting");
        }
      } catch (err) {
        console.log(err);
        res.clearCookie("webtoken", { path: "/" });
        res.send("Your token is not valid");
      }
    } else {
      res.send({
        code: 110,
      });
    }
  }
});

app.get("/", function (req, res) {
  res.send("Admin Homepage");
});

app.post("/signin", function (req, res) {
  db.select("email", "hash")
    .from("login")
    .where("email", "=", req.body.email)
    .then((data) => {
      const isValid = bcrypt.compareSync(req.body.password, data[0].hash);
      if (isValid) {
        return db
          .select("*")
          .from("users")
          .where("email", "=", req.body.email)
          .then((user) => {
            const token = jwtGenerator(user[0].id);
            res.cookie("webtoken", token, {
              expires: new Date(Date.now() + 8 * 3600000),
            });
            res.json({ token: token, user: user });
          })
          .catch((err) => res.status(400).json("Unable to get user"));
      } else {
        res.status(400).json("Wrong credentials!");
      }
    })
    .catch((err) => res.status(400).json("Wrong credentials!"));
});

app.post("/register", function (req, res) {
  const { email, name, password } = req.body;
  const hash = bcrypt.hashSync(password, 10);
  db.transaction((trx) => {
    trx
      .insert({
        hash: hash,
        email: email,
      })
      .into("login")
      .returning("email")
      .then((loginEmail) => {
        return trx("users")
          .returning("*")
          .insert({
            email: loginEmail[0],
            name: name,
            joined: new Date(),
          })
          .then((user) => {
            const token = jwtGenerator(user[0].id);
            res.cookie("webtoken", token, {
              expires: new Date(Date.now() + 8 * 3600000),
            });
            res.json({ token: token, user: user });
          });
      })
      .then(trx.commit)
      .catch(trx.rollback);
  }).catch((err) => res.status(400).json("unable to register"));
});

app.post("/addtask", function (req, res) {
  const { description, duedate, time } = req.body;
  db.returning("*")
    .insert({
      createdby: req.user_data.user.id,
      description: description,
      duedate: duedate,
      time: time,
    })
    .into("tasks")
    .then((task) => {
      res.json(task[0]);
    });
});

app.post("/tasks", function (req, res) {
  db.select("*")
    .from("tasks")
    .where("createdby", "=", req.body.createdby)
    .then((tasks) => {
      res.json(tasks);
    });
});

app.delete("/deletetask", function (req, res) {
  db("tasks").where("id", "=", req.body.id).del().then(res.json("Success"));
});

app.put("/changetask", function (req, res) {
  let query = {};
  if (req.body.description) {
    query["description"] = req.body.description;
  }

  if (req.body.duedate) {
    query["duedate"] = req.body.duedate;
  }

  if (req.body.time) {
    query["time"] = req.body.time;
  }

  if (req.body.done || req.body.done === false) {
    query["done"] = req.body.done;
  }

  db("tasks")
    .where("id", "=", req.body.id)
    .update(query)
    .then(res.json("Success"));
});

app.get("/verify", async (req, res) => {
  try {
    db.select("*")
      .from("users")
      .where("id", "=", req.user_data.user.id)
      .then((user) => {
        res.json({ answer: true, user: user[0] });
      });
  } catch (err) {
    console.log(err);
  }
});

app.listen(5000, () => {
  console.log("App is running on port 5000");
});
