const express = require('express');
const app = express();
app.use(express.json());

app.get('/', (req, res) => {
    res.send('Beast Antidetection Browser Backend');
});

app.listen(process.env.PORT || 3001, () => {
    console.log('Server running on port ' + (process.env.PORT || 3001));
});