const express = require('express');
const app = express();
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config()
const jwt = require('jsonwebtoken');
const port = process.env.PORT || 5000;
const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY);


// middleware
const corsOptions = {
    origin: '*',
    credentials: true,
    optionSuccessStatus: 200,
}
app.use(cors(corsOptions))
app.use(express.json())

const verifyJWT = (req, res, next) => {
    const authorization = req.headers.authorization;
    if (!authorization) {
        return res
            .status(401)
            .send({ error: true, message: "unauthorized access" });
    }

    const token = authorization.split(" ")[1];

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res
                .status(401)
                .send({ error: true, message: "unauthorized access" });
        }
        req.decoded = decoded;
        next();
    });
};



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.tdqyujf.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();


        const usersCollection = client.db("sportsDB").collection("users");
        const classesCollection = client.db("sportsDB").collection("classes");
        const cartsCollection = client.db("sportsDB").collection("carts")
        const paymentCollection = client.db("sportsDB").collection("payment");

        // jwt
        app.post("/jwt", (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
                expiresIn: "1h",
            });

            res.send({ token });
        });


        // verify admin
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            if (user?.role !== "Admin") {
                return res
                    .status(403)
                    .send({ error: true, message: "forbidden message" });
            }
            next();
        };

        //   verify instructor
        const verifyInstructor = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            if (user?.role !== "Instructor") {
                return res
                    .status(403)
                    .send({ error: true, message: "forbidden message" });
            }
            next();
        };

        // users api
        app.get('/users', verifyJWT, verifyAdmin, async (req, res) => {
            const result = await usersCollection.find().toArray();
            res.send(result);
        });


        app.post('/users', async (req, res) => {
            const user = req.body;
            const query = { email: user.email }
            const existingUser = await usersCollection.findOne(query);

            if (existingUser) {
                return res.send({ message: 'user already exists' })
            }

            const result = await usersCollection.insertOne(user);
            res.send(result);
        });

        app.get("/users/instructor", async (req, res) => {
            const query = { role: "Instructor" };
            const result = await usersCollection.find(query).toArray();
            res.send(result);
        });


        // check admin
        app.get("/users/admin/:email", verifyJWT, async (req, res) => {
            const email = req.params.email;

            if (req.decoded.email !== email) {
                res.send({ message: 'Student' });
            }

            const query = { email: email };
            const user = await usersCollection.findOne(query);

            if (user?.role === "Admin") {
                return res.send({ message: "Admin" });
            } else if (user?.role === "Instructor") {
                return res.send({ message: "Instructor" });
            } else {
                return res.send({ message: "Student" });
            }
        });

        app.patch('/users/admin/:id', async (req, res) => {
            const id = req.params.id;
            console.log(id);
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    role: 'Admin'
                },
            };

            const result = await usersCollection.updateOne(filter, updateDoc);
            res.send(result);

        })


        //   check instructors
        app.get('/users/instructor/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;

            if (req.decoded.email !== email) {
                res.send({ instructor: false })
            }

            const query = { email: email }
            const user = await usersCollection.findOne(query);
            const result = { admin: user?.role === 'Instructor' }
            res.send(result);
        })

        app.patch('/users/instructor/:id', async (req, res) => {
            const id = req.params.id;
            console.log(id);
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    role: 'Instructor'
                },
            };

            const result = await usersCollection.updateOne(filter, updateDoc);
            res.send(result);

        })


        // class api
        app.get('/classes', async (req, res) => {
            const result = await classesCollection.find().toArray();
            res.send(result);
        })

        app.get("/classes/approved", async (req, res) => {
            const query = { status: "Approved" };
            const result = await classesCollection.find(query).toArray();
            res.send(result);
        });

        app.get("/classes/popular", async (req, res) => {
            const query = { status: "Approved" };
            const result = await classesCollection
                .find(query)
                .sort({ enrolled: -1 })
                .limit(6)
                .toArray();
            res.send(result);
        });

        app.get("/classes/myClasses/:email", verifyJWT, verifyInstructor, async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const result = await classesCollection.find(query).toArray();
            res.send(result);
        });

        app.post('/classes', async (req, res) => {
            const newItem = req.body;
            const result = await classesCollection.insertOne(newItem)
            res.send(result);
        })

        app.patch("/classes/:id", async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updatedStatus = req.body;
            console.log(updatedStatus);
            const updateDoc = {
                $set: {
                    status: updatedStatus.status,
                },
            };
            const result = await classesCollection.updateOne(filter, updateDoc);

            res.send(result);
        });

        app.patch("/classUpdate/:id", async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updatedClass = req.body;
            // console.log(updatedClass);
            const updateDoc = {
                $set: {
                    price: updatedClass.price,
                    name: updatedClass.name,
                    seats: updatedClass.seats,
                    photo: updatedClass.photo,
                },
            };
            const result = await classesCollection.updateOne(filter, updateDoc);

            res.send(result);
        });

        app.patch("/classFeedback/:id", async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const addFeedback = req.body;
            // console.log(addFeedback);
            const updateDoc = {
                $set: {
                    feedback: addFeedback.feedback,
                },
            };
            const result = await classesCollection.updateOne(filter, updateDoc);

            res.send(result);
        });

        // selected carts api
        app.get('/carts', async (req, res) => {
            const result = await cartsCollection.find().toArray();
            res.send(result);
        })

        app.post('/carts', async (req, res) => {
            const newItem = req.body;

            const query = { _id: new ObjectId(newItem._id) };
            const existingUser = await cartsCollection.findOne(query);

            if (existingUser) {
                return res.send({ message: "Class already Selected" });
            }

            const result = await cartsCollection.insertOne(newItem)
            res.send(result);
        })

        app.delete('/carts/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await cartsCollection.deleteOne(query);
            res.send(result);
        })
        // selected class cart
        app.get("/selectClasses/:email", verifyJWT, async (req, res) => {
            const email = req.params.email;
            const query = { userEmail: email };
            const result = await cartsCollection.find(query).toArray();
            res.send(result);
        });

        app.get("/enrollClasses/:email", verifyJWT, async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const paymentData = await paymentCollection.find(query).toArray();
            const classes = await classesCollection
                .find({ _id: { $in: paymentData.map((id) => new ObjectId(id.classId)) } })
                .toArray();
            // const classes = await classesCollection
            //   .find({ _id: new ObjectId(paymentData.classId) })
            //   .toArray();
            res.send(classes);
        });


        // payment
        app.post("/create-payment-intent", verifyJWT, async (req, res) => {
            const { price } = req.body;
            const amount = parseInt(price * 100);
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: "usd",
                payment_method_types: ["card"],
            });

            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        });

        app.get("/payments/:email", verifyJWT, async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const result = await paymentCollection
                .find(query)
                .sort({ date: -1 })
                .toArray();
            res.send(result);
        });

        app.post("/payments", verifyJWT, async (req, res) => {
            const payment = req.body;
            console.log(payment);
            const insertResult = await paymentCollection.insertOne(payment);

            const query = {
                _id: new ObjectId(payment.cartItems),
            };
            console.log(query);
            const filter = {
                _id: new ObjectId(payment.classId),
            };
            console.log(filter);
            const updateDoc = {
                $inc: { seats: -1, enrolled: 1 },
            };
            const updateSeats = await classesCollection.updateOne(filter, updateDoc);
            const deleteResult = await cartsCollection.deleteOne(query);

            res.send({ insertResult, deleteResult, updateSeats });
        });

        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);




app.get('/', (req, res) => {
    res.send("Fahad's Sports");
});

app.listen(port, () => {
    console.log(`Fahad's Sports is running on port: ${port}`)
})