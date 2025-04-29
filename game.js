// Game constants
const elements = ["Fire", "Water", "Earth", "Air", "Lightning"];
const actions = ["Attack", "Shield", "Heal", "Teleport", "Double Attack"];

// Element strengths/weaknesses: Fire > Air > Earth > Water > Lightning > Fire
const elementStrengths = {
  "Fire": "Air",
  "Air": "Earth",
  "Earth": "Water",
  "Water": "Lightning",
  "Lightning": "Fire"
};

// Game state
let playerHand = [];
let playerHealth = 20;
let opponentHealth = 20;
let currentRoom = null;
let playerId = null;
let isPlayerTurn = false;
let unsubscribe = null;
let gameEnded = false; // Track if game has ended
let opponentId = null; // Track opponent's ID

// Generate a random card with element, action and power value
function getRandomCard() {
  const element = elements[Math.floor(Math.random() * elements.length)];
  const action = actions[Math.floor(Math.random() * actions.length)];
  const power = Math.floor(Math.random() * 4) + 2; // Power between 2-5
  return { element, action, power };
}

// Update the UI to reflect the current game state
function updateUI() {
  // Update health displays
  document.getElementById('player-health').innerText = playerHealth;
  document.getElementById('opponent-health').innerText = opponentHealth;
  
  // Update turn indicator
  document.getElementById('turn-indicator').innerText = isPlayerTurn ? "Your Turn" : "Opponent's Turn";
  
  // Update hand
  updateHand();
  
  // Show/hide game control buttons based on game state
  const gameControlsDiv = document.getElementById('game-controls');
  if (gameControlsDiv) {
    gameControlsDiv.style.display = gameEnded ? 'block' : 'none';
  }
}

// Show a custom notification
function showNotification(message, type = 'info', duration = 3000) {
  // Remove any existing notifications
  const existingNotification = document.querySelector('.game-notification');
  if (existingNotification) {
    existingNotification.remove();
  }
  
  // Create new notification
  const notification = document.createElement('div');
  notification.className = `game-notification notification-${type}`;
  notification.innerText = message;
  
  // Add to document
  document.body.appendChild(notification);
  
  // Trigger animation
  setTimeout(() => {
    notification.classList.add('notification-show');
  }, 10);
  
  // Hide after duration
  setTimeout(() => {
    notification.classList.remove('notification-show');
    setTimeout(() => {
      notification.remove();
    }, 300);
  }, duration);
}

// Draw a card and add it to the player's hand
function drawCard() {
  if (!currentRoom || !isPlayerTurn || gameEnded) return;
  
  if (playerHand.length < 7) { // Limit hand size
    const card = getRandomCard();
    playerHand.push(card);
    updateHand();
    
    // Update firestore
    const gameStateRef = db.collection('rooms').doc(currentRoom).collection('gameState').doc('current');
    gameStateRef.get().then(doc => {
      const data = doc.data();
      if (playerId === data.player1Id) {
        gameStateRef.update({
          player1Hand: firebase.firestore.FieldValue.arrayUnion(card)
        });
      } else {
        gameStateRef.update({
          player2Hand: firebase.firestore.FieldValue.arrayUnion(card)
        });
      }
    });
  }
}

// Play a card from the player's hand
function playCard(index) {
  if (!currentRoom || !isPlayerTurn || gameEnded) {
    if (gameEnded) {
      showNotification("Game already ended!", "info");
    } else if (!isPlayerTurn) {
      showNotification("Wait for your turn!", "info");
    }
    return;
  }
  
  const card = playerHand.splice(index, 1)[0];
  
  // Update the UI
  const playAreaElem = document.getElementById('play-area');
  playAreaElem.innerHTML = `
    <div class="played-card ${card.element.toLowerCase()}">
      <div class="card-element">${card.element}</div>
      <div class="card-action">${card.action}</div>
      <div class="card-power">Power: ${card.power}</div>
    </div>
  `;
  
  updateHand();
  
  // Apply card effect
  applyCardEffect(card);
  
  if (!gameEnded) {
    // End turn only if game is still active
    endTurn(card);
  }
}

// Apply the effect of the played card
function applyCardEffect(card) {
  let effectMessage = "";
  let damage = card.power;
  
  // Check if the last opponent card gives any elemental advantage
  const lastPlayedCard = document.getElementById('opponent-played-card');
  if (lastPlayedCard) {
    const opponentCardElement = lastPlayedCard.getAttribute('data-element');
    if (elementStrengths[card.element] === opponentCardElement) {
      damage *= 2;
      effectMessage = `<span class="bonus">SUPER EFFECTIVE! Damage doubled to ${damage}</span>`;
    }
  }
  
  // Apply effects based on action
  switch(card.action) {
    case "Attack":
      opponentHealth -= damage;
      effectMessage += `<br>Dealt ${damage} damage to opponent`;
      break;
    case "Shield":
      playerHealth += Math.floor(damage / 2);
      effectMessage += `<br>Gained ${Math.floor(damage / 2)} shield points`;
      break;
    case "Heal":
      playerHealth += damage;
      effectMessage += `<br>Healed for ${damage} health points`;
      break;
    case "Teleport":
      // Draw an extra card
      const extraCard = getRandomCard();
      playerHand.push(extraCard);
      effectMessage += `<br>Teleported and found a new card`;
      break;
    case "Double Attack":
      opponentHealth -= damage * 2;
      effectMessage += `<br>Double attack! Dealt ${damage * 2} damage`;
      break;
  }
  
  // Update effect message
  document.getElementById('effect-message').innerHTML = effectMessage;
  
  // Check for game over
  if (checkGameOver()) {
    // If game is over, don't proceed with turn end
    return;
  }
  
  // Update the UI
  updateUI();
}

// End the current player's turn
function endTurn(playedCard) {
  if (!currentRoom || gameEnded) return;
  
  isPlayerTurn = false;
  updateUI();
  
  // Update game state in Firestore
  const gameStateRef = db.collection('rooms').doc(currentRoom).collection('gameState').doc('current');
  gameStateRef.get().then(doc => {
    const data = doc.data();
    let updates = {
      currentTurn: playerId === data.player1Id ? data.player2Id : data.player1Id,
      lastPlayedCard: playedCard
    };
    
    if (playerId === data.player1Id) {
      updates.player1Hand = playerHand;
      updates.player2Health = opponentHealth;
      updates.player1Health = playerHealth;
    } else {
      updates.player2Hand = playerHand;
      updates.player1Health = opponentHealth;
      updates.player2Health = playerHealth;
    }
    
    gameStateRef.update(updates);
  });
}

// Update the player's hand display
function updateHand() {
  const handDiv = document.getElementById('player-hand');
  handDiv.innerHTML = '';
  
  playerHand.forEach((card, index) => {
    const cardDiv = document.createElement('div');
    cardDiv.className = `card ${card.element.toLowerCase()}`;
    cardDiv.innerHTML = `
      <div class="card-element">${card.element}</div>
      <div class="card-action">${card.action}</div>
      <div class="card-power">Power: ${card.power}</div>
    `;
    cardDiv.onclick = () => (!gameEnded && isPlayerTurn) ? playCard(index) : 
                             gameEnded ? alert("Game already ended!") : alert("Wait for your turn!");
    handDiv.appendChild(cardDiv);
  });
}

// Check if the game is over
function checkGameOver() {
  if (playerHealth <= 0 || opponentHealth <= 0) {
    gameEnded = true;
    
    // Show game over notification based on outcome
    if (playerHealth <= 0) {
      showNotification("Game Over! You lost!", "error", 5000);
    } else {
      showNotification("Congratulations! You won!", "success", 5000);
    }
    
    // Update game state in Firestore with winner info
    if (currentRoom) {
      const gameStateRef = db.collection('rooms').doc(currentRoom).collection('gameState').doc('current');
      gameStateRef.update({
        gameActive: false,
        winner: opponentHealth <= 0 ? playerId : null
      }).catch(error => {
        console.error("Error updating game state:", error);
      });
    }
    
    // Disable draw button
    document.getElementById('draw-button').disabled = true;
    
    // Show game control buttons
    document.getElementById('game-controls').style.display = 'block';
    
    return true;
  }
  return false;
}

// Reset the game for a rematch
function playAgain() {
  if (!currentRoom) return;
  
  // Reset local game state
  playerHand = [];
  playerHealth = 20;
  opponentHealth = 20;
  isPlayerTurn = false;
  gameEnded = false;
  
  // Re-enable draw button
  document.getElementById('draw-button').disabled = false;
  
  // Hide game controls
  document.getElementById('game-controls').style.display = 'none';
  
  // Clear play areas
  document.getElementById('play-area').innerHTML = 'No card played yet';
  document.getElementById('opponent-played-card').innerHTML = '';
  document.getElementById('effect-message').innerHTML = '';
  
  // Initialize hand with 3 cards
  for (let i = 0; i < 3; i++) {
    playerHand.push(getRandomCard());
  }
  
  // Update game state in Firestore
  const gameStateRef = db.collection('rooms').doc(currentRoom).collection('gameState').doc('current');
  gameStateRef.get().then(doc => {
    const data = doc.data();
    
    // Determine which player is requesting the rematch
    const isPlayer1 = playerId === data.player1Id;
    
    const updates = {
      player1Health: 20,
      player2Health: 20,
      lastPlayedCard: null,
      gameActive: true,
      winner: null,
      currentTurn: data.player1Id, // First player always starts
      rematchRequestedBy: playerId // Mark who requested the rematch
    };
    
    if (isPlayer1) {
      updates.player1Hand = playerHand;
    } else {
      updates.player2Hand = playerHand;
    }
    
    gameStateRef.update(updates).then(() => {
      showNotification("Rematch requested! Waiting for opponent...", "info");
      updateUI();
    }).catch(error => {
      console.error("Error requesting rematch:", error);
      showNotification("Error requesting rematch. Please try again.", "error");
    });
  });
}

// Leave the current game room
function leaveGame() {
  if (!currentRoom) return;
  
  // If we have an active listener, unsubscribe
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  
  // Update room status in Firestore
  const roomRef = db.collection('rooms').doc(currentRoom);
  roomRef.get().then(doc => {
    const data = doc.data();
    const players = data.players || [];
    
    // Remove the current player from the players array
    const updatedPlayers = players.filter(player => player !== playerId);
    
    // If there are no players left, mark the room as expired
    // Otherwise, just remove the current player
    const updates = {
      players: updatedPlayers,
      expired: updatedPlayers.length === 0 ? true : data.expired || false
    };
    
    return roomRef.update(updates);
  }).then(() => {
    // Get game state ref
    const gameStateRef = db.collection('rooms').doc(currentRoom).collection('gameState').doc('current');
    
    // Update game state to notify other player that this player left
    return gameStateRef.get().then(doc => {
      if (!doc.exists) return;
      
      const data = doc.data();
      const updates = {
        gameActive: false,
        playerLeft: playerId
      };
      
      // Clear player data
      if (playerId === data.player1Id) {
        updates.player1Id = null;
      } else if (playerId === data.player2Id) {
        updates.player2Id = null;
      }
      
      return gameStateRef.update(updates);
    });
  }).then(() => {
    // Reset local game state
    playerHand = [];
    playerHealth = 20;
    opponentHealth = 20;
    isPlayerTurn = false;
    gameEnded = false;
    currentRoom = null;
    opponentId = null;
    
    // Show room controls and hide game
    document.getElementById('waiting-message').style.display = 'none';
    document.getElementById('game').style.display = 'none';
    document.getElementById('room-controls').style.display = 'block';
    
    showNotification("You left the game room.", "info");
  }).catch(error => {
    console.error("Error leaving room:", error);
    showNotification("Error leaving room. Please try again.", "error");
  });
}

// Create a new game room
async function createRoom() {
  try {
    // Reset game state
    gameEnded = false;
    playerHand = [];
    playerHealth = 20;
    opponentHealth = 20;
    
    // Generate a unique player ID
    playerId = `player_${Date.now()}_${Math.floor(Math.random()*1000)}`;
    
    // Create a new room in Firestore
    const roomRef = await db.collection('rooms').add({
      createdAt: Date.now(),
      players: [playerId],
      gameActive: false,
      expired: false
    });
    
    currentRoom = roomRef.id;
    
    // Create initial game state
    await db.collection('rooms').doc(currentRoom).collection('gameState').doc('current').set({
      player1Id: playerId,
      player2Id: null,
      currentTurn: null,
      player1Health: 20,
      player2Health: 20,
      player1Hand: [],
      player2Hand: [],
      lastPlayedCard: null,
      gameActive: false,
      winner: null,
      rematchRequestedBy: null,
      playerLeft: null
    });
    
    // Re-enable draw button
    if (document.getElementById('draw-button')) {
      document.getElementById('draw-button').disabled = false;
    }
    
    // Subscribe to game state changes
    subscribeToGameState();
    
    // Show room ID
    document.getElementById('room-id-display').innerText = `Room ID: ${currentRoom}`;
    document.getElementById('waiting-message').style.display = 'block';
    document.getElementById('room-controls').style.display = 'none';
    
    showNotification(`Room Created! Share the Room ID with your opponent.`, "success", 7000);
  } catch (error) {
    console.error("Error creating room:", error);
    showNotification("Error creating room. Please try again.", "error");
  }
}

function createJoinRoomDialog() {
  // Check if dialog already exists
  if (document.getElementById('join-room-dialog')) return;

  const dialogHTML = `
    <div id="join-room-dialog" class="game-dialog">
      <div class="dialog-content">
        <h3>Join Game Room</h3>
        <div class="input-group">
          <label for="room-id-input">Room ID:</label>
          <input type="text" id="room-id-input" placeholder="Enter Room ID">
        </div>
        <div class="button-group">
          <button id="join-room-confirm" class="primary-button">Join</button>
          <button id="join-room-cancel" class="secondary-button">Cancel</button>
        </div>
      </div>
    </div>
  `;
  
  // Create dialog element
  const dialogContainer = document.createElement('div');
  dialogContainer.innerHTML = dialogHTML;
  document.body.appendChild(dialogContainer.firstElementChild);
  
  // Add event listeners
  document.getElementById('join-room-confirm').addEventListener('click', confirmJoinRoom);
  document.getElementById('join-room-cancel').addEventListener('click', closeJoinRoomDialog);
}

// Close the join room dialog
function closeJoinRoomDialog() {
  const dialog = document.getElementById('join-room-dialog');
  if (dialog) {
    dialog.classList.add('dialog-closing');
    setTimeout(() => {
      dialog.remove();
    }, 300);
  }
}

// Handle the room join confirmation
function confirmJoinRoom() {
  const roomIdInput = document.getElementById('room-id-input');
  const roomId = roomIdInput.value.trim();
  
  if (!roomId) {
    // Highlight the input field if empty
    roomIdInput.classList.add('input-error');
    setTimeout(() => roomIdInput.classList.remove('input-error'), 1000);
    return;
  }
  
  // Close dialog
  closeJoinRoomDialog();
  
  // Process the room joining
  processJoinRoom(roomId);
}

// Process joining the room with the provided ID
async function processJoinRoom(roomId) {
  try {
    // Show loading indicator
    showNotification("Connecting to room...", "info");
    
    // Reset game state
    gameEnded = false;
    playerHand = [];
    playerHealth = 20;
    opponentHealth = 20;
    
    const roomRef = db.collection('rooms').doc(roomId);
    const roomSnap = await roomRef.get();
    
    if (!roomSnap.exists) {
      showNotification("Room not found!", "error");
      return;
    }
    
    const roomData = roomSnap.data();
    
    // Check if room is expired
    if (roomData.expired) {
      showNotification("This room has expired!", "error");
      return;
    }
    
    // Check if room is full (both players are active)
    const gameStateRef = db.collection('rooms').doc(roomId).collection('gameState').doc('current');
    const gameStateSnap = await gameStateRef.get();
    
    if (gameStateSnap.exists) {
      const gameStateData = gameStateSnap.data();
      if (gameStateData.player1Id && gameStateData.player2Id && 
          gameStateData.player1Id !== null && gameStateData.player2Id !== null) {
        showNotification("Room is full!", "error");
        return;
      }
    }
    
    // Generate a unique player ID
    playerId = `player_${Date.now()}_${Math.floor(Math.random()*1000)}`;
    
    // Add player to the room
    await roomRef.update({
      players: firebase.firestore.FieldValue.arrayUnion(playerId),
      gameActive: true
    });
    
    // Get game state reference
    const gameStateData = gameStateSnap.data();
    
    // Store opponent ID
    opponentId = gameStateData.player1Id;
    
    // Update game state
    await gameStateRef.update({
      player2Id: playerId,
      currentTurn: gameStateData.player1Id, // First player starts
      gameActive: true,
      winner: null,
      rematchRequestedBy: null,
      playerLeft: null
    });
    
    currentRoom = roomId;
    
    // Re-enable draw button
    if (document.getElementById('draw-button')) {
      document.getElementById('draw-button').disabled = false;
    }
    
    // Subscribe to game state changes
    subscribeToGameState();
    
    // Initialize player hand
    for (let i = 0; i < 3; i++) {
      playerHand.push(getRandomCard());
    }
    
    // Update player hand in Firestore
    await gameStateRef.update({
      player2Hand: playerHand
    });
    
    // Hide room controls
    document.getElementById('room-controls').style.display = 'none';
    document.getElementById('game').style.display = 'block';
    
    showNotification("Joined room successfully! Wait for your turn.", "success");
  } catch (error) {
    console.error("Error joining room:", error);
    showNotification("Error joining room. Please try again.", "error");
  }
}

function joinExistingRoom() {
  createJoinRoomDialog();
  
  // Add animation class after a short delay to trigger transition
  setTimeout(() => {
    const dialog = document.getElementById('join-room-dialog');
    if (dialog) dialog.classList.add('dialog-active');
  }, 10);
}

// Subscribe to game state changes
function subscribeToGameState() {
  if (unsubscribe) {
    unsubscribe();
  }
  
  unsubscribe = db.collection('rooms').doc(currentRoom).collection('gameState').doc('current')
    .onSnapshot(snapshot => {
      const data = snapshot.data();
      if (!data) return;
      
      // Store opponent's ID
      if (playerId === data.player1Id && data.player2Id) {
        opponentId = data.player2Id;
      } else if (playerId === data.player2Id && data.player1Id) {
        opponentId = data.player1Id;
      }
      
      // Check if opponent left the game
      if (data.playerLeft && data.playerLeft !== playerId) {
        showNotification("Opponent left the game!", "info", 5000);
        gameEnded = true;
        document.getElementById('draw-button').disabled = true;
        document.getElementById('game-controls').style.display = 'block';
      }
      
      // Handle rematch requests
      if (data.rematchRequestedBy && data.rematchRequestedBy !== playerId) {
        // Opponent requested a rematch
        showNotification("Opponent wants a rematch! Click 'Play Again' to accept.", "info", 5000);
      }
      
      // If both players requested rematch, start new game
      if (data.rematchRequestedBy && data.gameActive && !gameEnded) {
        // Reset game state
        gameEnded = false;
        document.getElementById('draw-button').disabled = false;
        document.getElementById('game-controls').style.display = 'none';
        
        // Clear play areas
        document.getElementById('play-area').innerHTML = 'No card played yet';
        document.getElementById('opponent-played-card').innerHTML = '';
        document.getElementById('effect-message').innerHTML = '';
        
        // If player is player2 and doesn't have cards yet, initialize hand
        if (playerId === data.player2Id && (data.player2Hand === undefined || data.player2Hand.length === 0)) {
          playerHand = [];
          for (let i = 0; i < 3; i++) {
            playerHand.push(getRandomCard());
          }
          
          // Update player hand in Firestore
          snapshot.ref.update({
            player2Hand: playerHand
          });
        }
        
        showNotification("Game restarted! A new match begins.", "success");
      }
      
      // Check if game is active
      if (!data.gameActive) {
        // Only show win/lose message if game just ended and we haven't processed it yet
        if (!gameEnded && data.player1Id && data.player2Id) {
          gameEnded = true;
          
          // If there's a winner defined
          if (data.winner !== null) {
            if (data.winner === playerId) {
              showNotification("You won!", "success", 5000);
            } else {
              showNotification("You lost!", "error", 5000);
            }
          }
          
          // Disable draw button
          document.getElementById('draw-button').disabled = true;
          
          // Show game controls
          document.getElementById('game-controls').style.display = 'block';
        }
        return;
      }
      
      // Reset gameEnded flag if game becomes active again
      if (data.gameActive && gameEnded) {
        gameEnded = false;
        document.getElementById('draw-button').disabled = false;
        document.getElementById('game-controls').style.display = 'none';
      }
      
      // If player2 just joined, initialize player1's hand
      if (playerId === data.player1Id && data.player2Id && playerHand.length === 0) {
        for (let i = 0; i < 3; i++) {
          playerHand.push(getRandomCard());
        }
        
        // Update player hand in Firestore
        snapshot.ref.update({
          player1Hand: playerHand
        });
        
        document.getElementById('waiting-message').style.display = 'none';
        document.getElementById('game').style.display = 'block';
        
        // Notify player that opponent joined
        showNotification("Opponent joined! Game started.", "info");
      }
      
      // Update game state based on Firestore data
      if (playerId === data.player1Id) {
        playerHealth = data.player1Health;
        opponentHealth = data.player2Health;
        if (data.player1Hand) playerHand = data.player1Hand;
        isPlayerTurn = data.currentTurn === playerId;
      } else {
        playerHealth = data.player2Health;
        opponentHealth = data.player1Health;
        if (data.player2Hand) playerHand = data.player2Hand;
        isPlayerTurn = data.currentTurn === playerId;
      }
      
      // Notify player when it's their turn
      if (isPlayerTurn && data.lastPlayedCard) {
        showNotification("It's your turn!", "info", 2000);
      }
      
      // Update opponent's last played card
      if (data.lastPlayedCard && data.currentTurn === playerId) {
        const opponentPlayArea = document.getElementById('opponent-played-card');
        opponentPlayArea.innerHTML = `
          <div class="played-card ${data.lastPlayedCard.element.toLowerCase()}">
            <div class="card-element">${data.lastPlayedCard.element}</div>
            <div class="card-action">${data.lastPlayedCard.action}</div>
            <div class="card-power">Power: ${data.lastPlayedCard.power}</div>
          </div>
        `;
        opponentPlayArea.setAttribute('data-element', data.lastPlayedCard.element);
      }
      
      // Check for game over again based on updated health values
      checkGameOver();
      
      // Update UI
      updateUI();
    }, error => {
      console.error("Error in snapshot listener:", error);
      showNotification("Connection error. Please reload the page.", "error");
    });
}

// Initialize the game
function initGame() {
  // Start with empty hand
  updateHand();
  
  // Initialize UI
  updateUI();
  
  // Reset game state
  gameEnded = false;
}

// Clean up expired rooms (can be called periodically)
function cleanupExpiredRooms() {
  const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago
  
  db.collection('rooms')
    .where('createdAt', '<', cutoffTime)
    .get()
    .then(snapshot => {
      snapshot.forEach(doc => {
        db.collection('rooms').doc(doc.id).update({
          expired: true
        });
      });
    });
}

// Initialize when page loads
window.onload = function() {
  initGame();
  
  // Set up a timer to clean up expired rooms every hour
  setInterval(cleanupExpiredRooms, 60 * 60 * 1000);
};