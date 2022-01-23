const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const knex = require('knex');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors());
app.use(express.urlencoded({
    extended: true
}));
app.use(express.json());

const db = knex({
    client: 'pg',
    connection: {
      host : '127.0.0.1',
      user : 'postgres',
      password : 'test',
      database : 'to-do-list'
    }
  });

function jwtGenerator(user_id) {
    const payload = {
        user: {
            id: user_id
        }
    };

    return jwt.sign(payload, "supersecret123", { expiresIn: "10hr" });
}

app.get('/', function (req, res) {
    res.send('Admin Homepage')
})

app.post('/signin', function (req, res) {
    db.select('email', 'hash').from('login')
    .where('email', '=', req.body.email)
    .then(data => {
        const isValid  = bcrypt.compareSync(req.body.password, data[0].hash);
        if (isValid) {
            return db.select('*').from('users')
            .where('email', '=', req.body.email)
            .then(user => {
                const token = jwtGenerator(user[0].id);
                res.json( {token: token, user: user})
            })
            .catch(err => res.status(400).json('Unable to get user'))
        }
        else {
            res.status(400).json('Wrong credentials!')
        }
    })
    .catch(err => res.status(400).json('Wrong credentials!'))
})

app.post('/register', function (req, res) {
    const { email, name, password } = req.body;
    const hash = bcrypt.hashSync(password, 10);
    db.transaction(trx => {
        trx.insert({
            hash: hash,
            email: email
        })
            .into('login')
            .returning('email')
            .then(loginEmail => {
                return trx('users')
                    .returning('*')
                    .insert({
                        email: loginEmail[0],
                        name: name,
                        joined: new Date()
                    })
                    .then(user => {
                        const token = jwtGenerator(user[0].id);
                        res.json( {token: token, user: user})
                    })
            })
            .then(trx.commit)
            .catch(trx.rollback)
    })
        .catch(err => res.status(400).json('unable to register'))
})

app.post('/addtask', function(req, res) {
    const { createdby, description, duedate, time } = req.body;
    db.returning('*').insert({
        createdby: createdby,
        description: description,
        duedate: duedate,
        time: time
    }).into('tasks').then(task => {
        res.json(task[0])
    })
})

app.post('/tasks', function(req, res) {
    db.select('*').from('tasks').where('createdby', '=', req.body.createdby).then(tasks => {
        res.json(tasks)
    })
})

app.delete('/deletetask', function (req, res) {
    db('tasks')
    .where('id', '=', req.body.id)
    .del()
    .then(res.json('Success'))
})

app.put('/changetask', function (req, res) {
    db('tasks')
    .where('id', '=', req.body.id)
    .update({
        description: req.body.description,
        duedate: req.body.duedate
    }).then(res.json('Success'))
})

app.get("/verify", async (req, res) => {
    try {
        const jwtToken = req.header("token");
        if(!jwtToken) {
            return res.status(403).json("Not authorized");
        }
        const payload = jwt.verify(jwtToken, "supersecret123");
        req.user = payload.user;

        db.select('*').from('users').where('id', '=', req.user.id).then(user => {
            res.json({answer: true, user: user[0]});
        })
    } catch (err) {
        console.error(err.message);
        res.status(500).send("Server error");
    }
})

app.listen(5000, () => {
    console.log('App is running on port 5000')
})