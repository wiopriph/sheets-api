const fs = require('fs')
const readline = require('readline')
const {google} = require('googleapis')

const http = require('http')

const SCOPES = [ 'https://www.googleapis.com/auth/spreadsheets' ]
const TOKEN_PATH = 'token.json'
const SPREADSHEET_ID = '10EQ3nCqDCEOfCmJOPw91Kytg-i5IdaDNOqMvd0iBmz4'
const RANGE = 'Sheet1'

const PORT = 3000

fs.readFile('credentials.json', (err, content) => {
	if (err) {
		return console.log('Error loading client secret file:', err)
	}
	authorize(JSON.parse(content), createServerAndGoogleSheetsObj)
})

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials, callback) {
	const {client_secret, client_id, redirect_uris} = credentials.installed
	const oAuth2Client = new google.auth.OAuth2(
		client_id, client_secret, redirect_uris[ 0 ])

	fs.readFile(TOKEN_PATH, (err, token) => {
		if (err) return getNewToken(oAuth2Client, callback)
		oAuth2Client.setCredentials(JSON.parse(token))
		callback(oAuth2Client)
	})
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback for the authorized client.
 */
function getNewToken(oAuth2Client, callback) {
	const authUrl = oAuth2Client.generateAuthUrl({
		access_type: 'offline',
		scope: SCOPES,
	})
	console.log('Authorize this app by visiting this url:', authUrl)
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	})
	rl.question('Enter the code from that page here: ', (code) => {
		rl.close()
		oAuth2Client.getToken(code, (err, token) => {
			if (err) return console.error('Error while trying to retrieve access token', err)
			oAuth2Client.setCredentials(token)
			// Store the token to disk for later program executions
			fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
				if (err) console.error(err)
				console.log('Token stored to', TOKEN_PATH)
			})
			callback(oAuth2Client)
		})
	})
}

function createServerAndGoogleSheetsObj(oAuth2Client) {
	const sheets = google.sheets({version: 'v4', auth: oAuth2Client})
	const server = http.createServer((request, response) => {

		if (request.method === 'POST') {
			// request object is a 'stream' so we must wait for it to finish
			let body = ''
			let bodyParsed = {}

			request.on('data', chunk => {
				body += chunk
			})

			request.on('end', () => {
				bodyParsed = JSON.parse(body)
				saveDataAndSendResponse(bodyParsed.data, sheets, response)
			})

		} else {
			// normal GET response for testing the endpoint
			response.end('Request received')
		}

	})

	server.listen(PORT, (err) => {
		if (err) {
			return console.log('something bad happened', err)
		}
		console.log(`server is listening on ${PORT}`)
	})

}

function saveDataAndSendResponse(data, googleSheetsObj, response) {
	// data is an array of arrays
	// each inner array is a row
	// each array element (of an inner array) is a column
	let resource = {
		values: data,
	}

	googleSheetsObj.spreadsheets.values.append({
		spreadsheetId: SPREADSHEET_ID,
		range: RANGE,
		valueInputOption: 'RAW',
		resource,
	}, (err, result) => {
		if (err) {
			console.log(err)
			response.end('An error occurd while attempting to save data. See console output.')
		} else {
			const responseText = `${result.data.updates.updatedCells} cells appended.`
			console.log(responseText)
			response.end(responseText)
		}
	})

}
