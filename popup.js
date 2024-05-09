let apiKey;

document.addEventListener('DOMContentLoaded', function () {
  const apiKeyInput = document.getElementById('apiKeyInput');
  const saveAPIKeyBtn = document.getElementById('saveAPIKeyBtn');
  const captureBtn = document.getElementById('captureBtn');
  const apiKeyContainer = document.getElementById('apiKeyContainer');
  const responseDiv = document.getElementById('response');

  loadAPIKey();
  loadResponseFromStorage();

  saveAPIKeyBtn.addEventListener('click', function () {
    apiKey = apiKeyInput.value;
    chrome.storage.sync.set({ apiKey: apiKey }, function () {
      apiKeyContainer.style.display = 'none';
    });
  });

  captureBtn.addEventListener('click', captureScreenshot);
  window.addEventListener('beforeunload', function () {
    const responseText = responseDiv.innerText;
    chrome.runtime.sendMessage({ action: 'setResponse', responseText: responseText });
  });
});

function loadAPIKey() {
  chrome.storage.sync.get(['apiKey'], function (result) {
    if (result.apiKey) {
      apiKey = result.apiKey;
    } else {
      document.getElementById('apiKeyContainer').style.display = 'block';
    }
  });
}

function loadResponseFromStorage() {
  chrome.runtime.sendMessage({ action: 'getResponse' }, function (response) {
    document.getElementById('response').innerText = response.response;
  });
}

function captureScreenshot() {
  if (!apiKey) {
    alert('Please enter your API key first.');
    return;
  }

  chrome.runtime.sendMessage({ action: 'clearResponse' });
  document.getElementById('response').innerText = '';
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    var activeTab = tabs[0];
    chrome.tabs.captureVisibleTab(activeTab.windowId, { format: 'png' }, function (dataUrl) {
      if (chrome.runtime.lastError) {
        console.error('Error capturing screenshot:', chrome.runtime.lastError.message);
        return;
      }
      cropImage(dataUrl, function (croppedDataUrl) {
        sendToAPI(croppedDataUrl);
      });
    });
  });
}

function cropImage(dataUrl, callback) {
  var image = new Image();
  image.onload = function () {
    var canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    var croppedDataUrl = canvas.toDataURL('image/png');
    callback(croppedDataUrl);
  };
  image.src = dataUrl;
}

function sendToAPI(dataUrl) {
  const options = {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      top_k: 5,
      image: dataUrl.split(',')[1]
    })
  };

  fetch('https://dev.geospy.ai/predict', options)
    .then(response => {
      if (response.status === 401) {
        showInvalidAPIKeyPrompt();
      } else {
        return response.json();
      }
    })
    .then(response => {
      if (response) {
        const predictions = response.geo_predictions;
        const highestScoredPrediction = predictions.reduce((prev, current) => (prev.score > current.score) ? prev : current);
        const coordinates = highestScoredPrediction.coordinates;
        const address = highestScoredPrediction.address;
        const googleMapsLink = `https://www.google.com/maps/search/?api=1&query=${coordinates[0]},${coordinates[1]}`;
        
        // Fetch additional location details from OSM Nominatim API
        fetchLocationDetails(coordinates, (locationDetails) => {
          const { country, state, district, town } = locationDetails;
          const responseText = `Address: ${address}\nCoordinates: <a href="${googleMapsLink}" target="_blank">${coordinates.join(', ')}</a>\nCountry: ${country}\nState: ${state}\nDistrict: ${district}\nTown: ${town}`;
          const responseDiv = document.getElementById('response');
          responseDiv.innerHTML = responseText;
          chrome.runtime.sendMessage({ action: 'setResponse', responseText: responseText });
        });
      }
    })
    .catch(error => {
      console.error('Error:', error);
    });
}

function fetchLocationDetails(coordinates, callback) {
  const [latitude, longitude] = coordinates;
  const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`;

  fetch(nominatimUrl)
    .then(response => response.json())
    .then(data => {
      const country = data.address.country || 'N/A';
      const state = data.address.state || 'N/A';
      const district = data.address.county || 'N/A';
      const town = data.address.town || data.address.village || 'N/A';
      callback({ country, state, district, town });
    })
    .catch(error => {
      console.error('Error fetching location details:', error);
      callback({ country: 'N/A', state: 'N/A', district: 'N/A', town: 'N/A' });
    });
}

function showInvalidAPIKeyPrompt() {
  const newAPIKey = prompt('Your API key is invalid. Please enter a new API key:');
  if (newAPIKey) {
    apiKey = newAPIKey;
    chrome.storage.sync.set({ apiKey: newAPIKey }, function () {
      captureScreenshot(); // Retry the screenshot capture with the new API key
    });
  }
}