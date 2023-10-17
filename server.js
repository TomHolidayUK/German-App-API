// Import packages
const express = require('express');
const bcrypt = require('bcryptjs');
const cors = require('cors');
// const axios = require('axios');

// knex is used to connect with database
const knex = require('knex')

// // Import the Google Cloud client library
const textToSpeech = require('@google-cloud/text-to-speech');

// // Import other required libraries
// const fs = require('fs');
// const util = require('util');


const db = knex({
    client: 'pg',
    connection: {

    //   host : '127.0.0.1',
    //   port : 5432,
    //   user : 'postgres',
    //   password : 'test',
    //   database : 'french_app'

    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
      }
    }
});

//   db.select('*').from('users').then(data => {
//     console.log(data);
//   });

// console.log(db.select('*').from('users'));

// Create app by running express
const app = express();

// Create middleware for parsing and cors (so we can communicate with server)
app.use(express.json());
app.use(cors());


// // Create local database for list of user. This will later be a real database
// const database = {
//     users: [
//         {
//             id: '123',
//             name: 'John',
//             email: 'john@gmail.com',
//             password: 'cookies',
//             progress: 0,
//             joined: new Date()
//         },
//         {
//             id: '124',
//             name: 'Sally',
//             email: 'sally@gmail.com',
//             password: 'bananas',
//             progress: 0,
//             joined: new Date()
//         },
//     ],
//     login: [
//         {
//             id: '987',
//             hash: '',
//             email: 'john@gmail.com'
//         }
//     ]
// }

// Create basic route
app.get('/', (req, res) => {
    res.send('it is working')
})

// Sign-in route
app.post('/signin', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json('You have submitted invalid details')
    }
    // here we need to check the users login details are correct 
    db.select('email', 'hash').from('login')
        .where('email', '=', email)
        .then(data => {
            bcrypt.compare(password, data[0].hash, (err, isMatch) => {
            if (err) {
                    console.error(err);
                } else {
                if (isMatch) {
                    // If isMatch is valid, return user details
                    return db.select('*').from('users')
                        .where('email', '=', email)
                        .then(user => {
                            console.log('Password is correct.')
                            console.log(user);
                            res.json(user[0]);
                        })
                        .catch(err => res.status(400).json('Unable to get user'))
                } else {
                    // If isMatch is invalid...
                    res.status(400).json('You have entered incorrect login details')
                }}
            });
        })
        .catch(err => res.status(400).json('Wrong credentials'))
})

// Register route
app.post('/register', (req, res) => {
    // Add user data from body to the database of users
    const { email, name, password } = req.body;
    if (!email || !name || !password) {
        return res.status(400).json('You have submitted invalid details')
    }
    // const hash = bcrypt.hashSync(password)

    const bcryptCostFactor = 10;
    bcrypt.genSalt(bcryptCostFactor, (err, salt) => {
        bcrypt.hash(password, salt, (err, hash) => {
          if (err) {
            console.error('error with hashing:', err);
          } 
          else 
            {
                console.log('Hashed password:', hash);
                // We need to update the 'users' and 'login' database at the same time. We do this with transactions
                // Transactions work when we are doing multiple operations on one database to ensure that everything is updated 
                // In this transaction we first post to the 'login' database, we then return email and with this email we post to 'users'
                // We create a transaction when we need to do more than 2 things at once, we use trx instead of db to do all operations
                db.transaction(trx => {
                    trx.insert({
                        hash: hash,
                        email: email
                    })
                    .into('login')
                    .returning('email')
                    .then(loginEmail => {
                        // Post registered user to the database 'users'
                        return trx('users')
                            .returning('*') // With knex we use .returning() to return to the user everything that has been inserted
                            .insert({
                                email: email,
                                // email: loginEmail[0],
                                // email: loginEmail[0].email,
                                name: name,
                                joined: new Date()
                            })
                            // Update the users in the front end also
                            .then(user => {
                                res.json(user[0]) // Return recently registered user
                            })
                    })
                    // Finally we need to commit to add all of the above, if an error is caught we 'rollback': 
                    // we cancel the transaction and undo any changes that were made within that transaction
                    .then(trx.commit)
                    .catch(trx.rollback)
                })
                .catch(err => res.status(400).json('Unable to register')) 
            }
        });
    });
})

// Profile route - this could be used to grab and edit user info, for example update email address
app.get('/profile/:id', (req, res) => {
    // Check to see if the current user is in the database
    const { id } = req.params;
    
    // Select user from database. Use .where() to filter the user by id
    db.select('*').from('users').where({
        id: id
    }).then(user => {
        if (user.length) {
        res.json(user[0]);
    } else {
        res.status(400).json('User not found')
    }
    })
    .catch(err => res.status(400).json('Error getting user'))
})

// Need to create a filepath for the environmental variables where the API keys are stored
const keyData = process.env.KEYFILENAME2;
const fs = require('fs');
const tempFilePath = './temp-key-file.json';
fs.writeFileSync(tempFilePath, keyData);

// Create client with API keys path
const client = new textToSpeech.TextToSpeechClient({
    keyFilename: tempFilePath,
    // keyFilename: './direct-album-395018-0bfba99f4849.json',
    projectId: 'direct-album-395018',
  });

app.get('/synthesize-speech', async (req, res) => {
    try {
        const { text } = req.query;
        console.log('test', req.query)
        const request = {
          input: { text },
          voice: { languageCode: 'de-DE', ssmlGender: 'FEMALE' },
          audioConfig: { audioEncoding: 'MP3' },
        };
  
      const [response] = await client.synthesizeSpeech(request);
      // Send the synthesized audio data as a response
      res.send(response.audioContent);
    } catch (error) {
      console.error('Error synthesizing speech:', error);
      res.status(500).send(`Internal server error. 1 = ${client.keyFilename}, 2 = ${process.env.KEYFILENAME}, 3 = ${client.projectId}`);
    }
  });

app.post('/update-list')

// Progress route
app.put('/progress', (req, res) => {
    const { id } = req.body;
    // If the id is verified, then update progress using increment()
    db('users').where('id', '=', id)
    .increment('progress', 1)
    .returning('progress')
    .then(progress => {
        res.json(progress[0])
        // res.json(progress[0].progress)
    })
    .catch(err => res.status(400).json('Unable to get entries'))
})

// Create a listen 
// app.listen(3000, ()=> {
//     console.log('app is running on port 3000'); 
// })
app.listen(process.env.PORT || 3000, () => {
    console.log(`Server running on port ${process.env.PORT}`)
})


// Plan of routes 
// /signin --> POST = success/fail
// /register --> POST = user 
// /profile/:userid --> GET user (for custom setup page)
// /progress --> PUT --> user
// ...

// Security
// We add the user's password to a POST request and send over HTTPS so that it is encrypted
// We store the password as a hash using bcrypt with a cost factor of 10