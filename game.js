// Game constants
const elements = ["Fire", "Water", "Earth", "Air", "Lightning", "Ice", "Light", "Time", "Shadow"];
const actions = ["Attack", "Shield", "Heal", "Teleport", "Double Attack"];

// Element strengths/weaknesses - expanded circle
// Fire > Air > Earth > Water > Lightning > Ice > Light > Shadow > Time > Fire
const elementStrengths = {
  "Fire": "Air",
  "Air": "Earth",
  "Earth": "Water",
  "Water": "Lightning",
  "Lightning": "Ice",
  "Ice": "Light",
  "Light": "Shadow",
  "Shadow": "Time",
  "Time": "Fire"
};

// Special element abilities - each element has a unique power
const elementSpecials = {
  "Fire": "Burn", // Burns opponent over time (DOT)
  "Water": "Flood", // Reduces opponent's next card power
  "Earth": "Fortify", // Increases shield effectiveness
  "Air": "Gust", // Can skip opponent's next turn
  "Lightning": "Shock", // Has chance to stun opponent
  "Ice": "Freeze", // Reduces opponent's timer
  "Light": "Purify", // Removes negative effects
  "Shadow": "Stealth", // Steals a card from opponent
  "Time": "Rewind" // Returns last played card to hand
};

// Game state
let playerHand = [];
let playerHealth = 30;
let opponentHealth = 30;
let currentRoom = null;
let playerId = null;
let isPlayerTurn = false;
let unsubscribe = null;
let gameEnded = false;
let opponentId = null;
let lastProcessedRematchId = null;
let rematchAccepted = false;
let burnEffect = 0; // DOT counter for Fire element
let floodEffect = 0; // Power reduction from Water element
let stunEffect = false; // Stun effect from Lightning
let skipNextTurn = false; // Skip effect from Air
let turnTimeLimit = 30; // Time limit for turns in seconds
let turnTimer = null; // Timer reference
let timeRemaining = turnTimeLimit; // Current time remaining

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
  
  // Update timer display
  updateTimerDisplay();
  
  // Update status effects
  updateStatusEffectsDisplay();
  
  // Update hand
  updateHand();
  
  // Show/hide game control buttons based on game state
  const gameControlsDiv = document.getElementById('game-controls');
  if (gameControlsDiv) {
    gameControlsDiv.style.display = gameEnded ? 'block' : 'none';
  }
}

// Update the timer display
function updateTimerDisplay() {
  const timerDisplay = document.getElementById('turn-timer');
  if (timerDisplay) {
    timerDisplay.innerText = timeRemaining;
    
    // Add visual warning when time is low
    if (timeRemaining <= 5) {
      timerDisplay.classList.add('timer-warning');
    } else {
      timerDisplay.classList.remove('timer-warning');
    }
  }
}

// Update the status effects display
function updateStatusEffectsDisplay() {
  const statusDisplay = document.getElementById('status-effects');
  if (!statusDisplay) return;
  
  let statusText = "";
  
  if (burnEffect > 0) {
    statusText += `<span class="status-effect fire-effect">Burn (${burnEffect})</span>`;
  }
  
  if (floodEffect > 0) {
    statusText += `<span class="status-effect water-effect">Flooded (${floodEffect})</span>`;
  }
  
  if (stunEffect) {
    statusText += `<span class="status-effect lightning-effect">Stunned</span>`;
  }
  
  if (skipNextTurn) {
    statusText += `<span class="status-effect air-effect">Turn Skip</span>`;
  }
  
  statusDisplay.innerHTML = statusText || "No active effects";
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

// Start the turn timer
function startTurnTimer() {
  // Clear any existing timer
  clearTurnTimer();
  
  // Only start timer if it's player's turn and game is active
  if (!isPlayerTurn || gameEnded) return;
  
  // Reset time remaining
  timeRemaining = turnTimeLimit;
  updateTimerDisplay();
  
  // Start new timer
  turnTimer = setInterval(() => {
    timeRemaining--;
    updateTimerDisplay();
    
    // Check if time's up
    if (timeRemaining <= 0) {
      clearInterval(turnTimer);
      // Force end of turn if time runs out
      showNotification("Time's up! Turn ended.", "warning");
      handleTimeOut();
    }
  }, 1000);
}

// Clear the turn timer
function clearTurnTimer() {
  if (turnTimer) {
    clearInterval(turnTimer);
    turnTimer = null;
  }
}

// Handle timeout when turn timer expires
function handleTimeOut() {
  if (!currentRoom || !isPlayerTurn || gameEnded) return;
  
  // Auto-play a random card or end turn if no cards available
  if (playerHand.length > 0) {
    // Play a random card
    const randomIndex = Math.floor(Math.random() * playerHand.length);
    playCard(randomIndex, true); // true flag indicates this is an auto-play
  } else {
    // Just end turn with no card played
    endTurn(null);
  }
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

// Apply element special ability effects
function applyElementSpecial(card) {
  const specialAbility = elementSpecials[card.element];
  let specialMessage = "";
  
  switch(specialAbility) {
    case "Burn":
      burnEffect = 3; // Burn for 3 turns
      specialMessage = "Opponent is burning! They'll take damage over time.";
      break;
    case "Flood":
      floodEffect = 2; // Reduce opponent's power for 2 turns
      specialMessage = "Opponent is flooded! Their card power will be reduced.";
      break;
    case "Fortify":
      // Increase shield effect for this turn only
      specialMessage = "Your shields are fortified! Shield effects are 50% stronger.";
      break;
    case "Gust":
	  // 30% chance to skip
	  if (Math.random() < 0.3) {
		skipNextTurn = true;
		specialMessage = "You summoned a powerful gust! Opponent will skip their next turn.";
	  }
      break;
    case "Shock":
      // 50% chance to stun
      if (Math.random() < 0.5) {
        stunEffect = true;
        specialMessage = "Opponent is shocked! They are stunned for their next turn.";
      }
      break;
    case "Freeze":
      specialMessage = "Opponent is frozen! Their turn timer will be reduced.";
      // This will be handled in the game state update
      break;
    case "Purify":
      // Remove negative effects
      burnEffect = 0;
      floodEffect = 0;
      stunEffect = false;
      specialMessage = "You purified yourself! All negative effects are removed.";
      break;
    case "Stealth":
      // Only steal if opponent has cards
      specialMessage = "You used stealth to take a card from your opponent.";
      // This will be handled in the game state update
      break;
    case "Rewind":
      // Return the last played card to hand
      specialMessage = "You manipulated time to return your last card to your hand.";
      // This will be handled in playCard function
      break;
  }
  
  return specialMessage;
}

// Play a card from the player's hand
function playCard(index, isAutoPlay = false) {
  if (!currentRoom || !isPlayerTurn || gameEnded) {
    if (gameEnded) {
      showNotification("Game already ended!", "info");
    } else if (!isPlayerTurn) {
      showNotification("Wait for your turn!", "info");
    }
    return;
  }
  
  // Check for stun effect
  if (stunEffect && !isAutoPlay) {
    showNotification("You're stunned and cannot play cards this turn!", "warning");
    return;
  }
  
  // Prevent playing cards if rematch is requested but not yet accepted
  const gameStateRef = db.collection('rooms').doc(currentRoom).collection('gameState').doc('current');
  gameStateRef.get().then(doc => {
    const data = doc.data();
    
    if (data.rematchRequestedBy && !data.rematchAccepted) {
      showNotification("Cannot play - waiting for rematch confirmation!", "info");
      return;
    }
    
    // Time Rewind special ability check
    let card;
    if (index === 'rewind' && data.lastPlayedCard && data.lastPlayedCard.element === 'Time') {
      // Special case for Time element's rewind ability
      card = data.lastPlayedCard;
      // Add the card back to hand
      playerHand.push(card);
    } else {
      // Regular card play
      card = playerHand.splice(index, 1)[0];
    }
    
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
      // Clear turn timer when card is played
      clearTurnTimer();
      
      // End turn only if game is still active
      endTurn(card);
    }
  }).catch(error => {
    console.error("Error checking game state:", error);
    showNotification("Error playing card. Please try again.", "error");
  });
}

// Apply the effect of the played card
function applyCardEffect(card) {
  let effectMessage = "";
  let damage = card.power;
  
  // Apply flood effect if active
  if (floodEffect > 0) {
    damage = Math.max(1, damage - 1); // Reduce damage by 1, but minimum 1
    effectMessage += `<span class="debuff">Flood reduces power to ${damage}</span><br>`;
    floodEffect--;
  }
  
  // Check if the last opponent card gives any elemental advantage
  const lastPlayedCard = document.getElementById('opponent-played-card');
  if (lastPlayedCard) {
    const opponentCardElement = lastPlayedCard.getAttribute('data-element');
    if (elementStrengths[card.element] === opponentCardElement) {
      damage *= 2;
      effectMessage += `<span class="bonus">SUPER EFFECTIVE! Power doubled to ${damage}</span><br>`;
    }
  }
  
  // Apply effects based on action
  switch(card.action) {
    case "Attack":
      opponentHealth -= damage;
      effectMessage += `Dealt ${damage} damage to opponent`;
      break;
    case "Shield":
      // Check for Earth element's Fortify special
      let shieldAmount = Math.floor(damage / 2);
      if (card.element === "Earth") {
        shieldAmount = Math.floor(shieldAmount * 1.5); // 50% shield boost
        effectMessage += `<span class="bonus">Earth Fortify boosts shield by 50%!</span><br>`;
      }
      playerHealth += shieldAmount;
      effectMessage += `Gained ${shieldAmount} shield points`;
      break;
    case "Heal":
      playerHealth += damage;
      effectMessage += `Healed for ${damage} health points`;
      break;
    case "Teleport":
      // Draw an extra card
      const extraCard = getRandomCard();
      playerHand.push(extraCard);
      effectMessage += `Teleported and found a new card`;
      break;
    case "Double Attack":
      opponentHealth -= damage * 2;
      effectMessage += `Double attack! Dealt ${damage * 2} damage`;
      break;
  }
  
  // 30% chance for special abilities to trigger
  const specialChance = 0.3;
  if (Math.random() < specialChance) {
    const specialMessage = applyElementSpecial(card);
    if (specialMessage) {
      effectMessage += `<br><span class="special">${specialMessage}</span>`;
    }
  }
  
  // Update effect message
  document.getElementById('effect-message').innerHTML = effectMessage;
  
  // Check for game over
  const isGameOver = checkGameOver();
  
  // Only update UI if game is not over
  if (!isGameOver) {
    updateUI();
  } else {
    // Force update UI one last time to show final state
    updateUI();
  }
}

// End the current player's turn
function endTurn(playedCard) {
  if (!currentRoom || gameEnded) return;
  
  isPlayerTurn = false;
  updateUI();
  
  // Clear the turn timer
  clearTurnTimer();
  
  // Update game state in Firestore
  const gameStateRef = db.collection('rooms').doc(currentRoom).collection('gameState').doc('current');
  gameStateRef.get().then(doc => {
    const data = doc.data();
    let updates = {
      currentTurn: playerId === data.player1Id ? data.player2Id : data.player1Id,
      lastPlayedCard: playedCard
    };
    
    // Add status effects to the update
    if (playerId === data.player1Id) {
      updates.player1Hand = playerHand;
      updates.player2Health = opponentHealth;
      updates.player1Health = playerHealth;
      updates.player2BurnEffect = burnEffect;
      updates.player2FloodEffect = floodEffect;
      updates.player2StunEffect = stunEffect;
      updates.player2SkipTurn = skipNextTurn;
      
      // If Ice was played, reduce opponent's time
      if (playedCard && playedCard.element === "Ice") {
        updates.player2TimeReduction = 10; // Reduce opponent's time by 10 seconds
      }
      
      // If Shadow was played, steal a card
      if (playedCard && playedCard.element === "Shadow" && data.player2Hand && data.player2Hand.length > 0) {
        // Randomly select a card from opponent's hand
        const stolenCardIndex = Math.floor(Math.random() * data.player2Hand.length);
        const stolenCard = data.player2Hand[stolenCardIndex];
        
        // Remove the card from opponent's hand
        const updatedOpponentHand = [...data.player2Hand];
        updatedOpponentHand.splice(stolenCardIndex, 1);
        updates.player2Hand = updatedOpponentHand;
        
        // Add to player's hand
        playerHand.push(stolenCard);
        updates.player1Hand = playerHand;
      }
    } else {
      updates.player2Hand = playerHand;
      updates.player1Health = opponentHealth;
      updates.player2Health = playerHealth;
      updates.player1BurnEffect = burnEffect;
      updates.player1FloodEffect = floodEffect;
      updates.player1StunEffect = stunEffect;
      updates.player1SkipTurn = skipNextTurn;
      
      // If Ice was played, reduce opponent's time
      if (playedCard && playedCard.element === "Ice") {
        updates.player1TimeReduction = 10; // Reduce opponent's time by 10 seconds
      }
      
      // If Shadow was played, steal a card
      if (playedCard && playedCard.element === "Shadow" && data.player1Hand && data.player1Hand.length > 0) {
        // Randomly select a card from opponent's hand
        const stolenCardIndex = Math.floor(Math.random() * data.player1Hand.length);
        const stolenCard = data.player1Hand[stolenCardIndex];
        
        // Remove the card from opponent's hand
        const updatedOpponentHand = [...data.player1Hand];
        updatedOpponentHand.splice(stolenCardIndex, 1);
        updates.player1Hand = updatedOpponentHand;
        
        // Add to player's hand
        playerHand.push(stolenCard);
        updates.player2Hand = playerHand;
      }
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
      <div class="card-special">${elementSpecials[card.element]}</div>
    `;
    cardDiv.onclick = () => (!gameEnded && isPlayerTurn) ? playCard(index) : 
                             gameEnded ? alert("Game already ended!") : alert("Wait for your turn!");
    handDiv.appendChild(cardDiv);
  });
}

// Process turn start - handle effects and start timer
function processTurnStart() {
  // Apply DOT effects
  if (burnEffect > 0) {
    playerHealth -= 1; // Burn deals 1 damage per turn
    burnEffect--;
    showNotification("Burn effect deals 1 damage!", "warning");
  }
  
  // Apply stun - skip turn if stunned
  if (stunEffect) {
    showNotification("You're stunned! Your turn will be skipped.", "warning");
    stunEffect = false; // Remove stun after this turn
    
    // Auto end turn after a delay
    setTimeout(() => {
      endTurn(null); // End turn with no card played
    }, 2000);
    return false; // Don't start timer or allow actions
  }
  
  // Apply skip turn
  if (skipNextTurn) {
    showNotification("Your turn is skipped due to opponent's Air magic!", "warning");
    skipNextTurn = false; // Remove skip effect
    
    // Auto end turn after a delay
    setTimeout(() => {
      endTurn(null); // End turn with no card played
    }, 2000);
    return false; // Don't start timer or allow actions
  }
  
  // Check game over after effects
  const isGameOver = checkGameOver();
  if (isGameOver) {
    return false; // Don't start timer if game is over
  }
  
  return true; // Return true if turn can proceed normally
}

// Check if the game is over
function checkGameOver() {
  if (playerHealth <= 0 || opponentHealth <= 0) {
    gameEnded = true;
    
    // Clear any active timer
    clearTurnTimer();
    
    // Show game over notification based on outcome
    if (playerHealth <= 0) {
      showNotification("Game Over! You lost!", "error", 5000);
    } else if (opponentHealth <= 0) {
      showNotification("Congratulations! You won!", "success", 5000);
    }
    
    // Update game state in Firestore with winner info
    if (currentRoom) {
      const gameStateRef = db.collection('rooms').doc(currentRoom).collection('gameState').doc('current');
      gameStateRef.update({
        gameActive: false,
        winner: opponentHealth <= 0 ? playerId : (playerId === opponentId ? null : opponentId),
        rematchAccepted: false, // Reset rematch status when game ends
        rematchRequestedBy: null // Clear any rematch requests
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
  
  // Reset rematch tracking
  rematchAccepted = false;
  
  // Get the game state reference
  const gameStateRef = db.collection('rooms').doc(currentRoom).collection('gameState').doc('current');
  
  // Check if there's already a rematch request pending
  gameStateRef.get().then(doc => {
    const data = doc.data();
    
    // If a rematch was already requested by the opponent, this player is accepting it
    if (data.rematchRequestedBy && data.rematchRequestedBy !== playerId) {
      // Both players have agreed to rematch - start new game
      rematchAccepted = true;
      
      // Reset local game state
      playerHand = [];
      playerHealth = 30;
      opponentHealth = 30;
      isPlayerTurn = false;
      gameEnded = false;
      burnEffect = 0;
      floodEffect = 0;
      stunEffect = false;
      skipNextTurn = false;
      
      // Clear any active timer
      clearTurnTimer();
      
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
      
      // Update game state in Firestore to start the new game
      const updates = {
        player1Health: 20,
        player2Health: 20,
        lastPlayedCard: null,
        gameActive: true,
        winner: null,
        currentTurn: data.player1Id, // First player always starts
        // Clear rematch requests as they've been accepted
        rematchRequestedBy: null,
        rematchAccepted: true,
        rematchTimestamp: Date.now(),
        // Reset all status effects
        player1BurnEffect: 0,
        player1FloodEffect: 0,
        player1StunEffect: false,
        player1SkipTurn: false,
        player2BurnEffect: 0,
        player2FloodEffect: 0,
        player2StunEffect: false,
        player2SkipTurn: false
      };
      
      // Update player's hand based on which player they are
      if (playerId === data.player1Id) {
        updates.player1Hand = playerHand;
      } else {
        updates.player2Hand = playerHand;
      }
      
      gameStateRef.update(updates).then(() => {
        showNotification("Rematch accepted! Starting new game...", "success");
        updateUI();
      }).catch(error => {
        console.error("Error starting rematch:", error);
        showNotification("Error starting rematch. Please try again.", "error");
      });
    } else {
      // This is the first player requesting a rematch
      // Reset local game state but keep gameEnded true until rematch is accepted
      playerHand = [];
      playerHealth = 30;
      opponentHealth = 30;
      isPlayerTurn = false;
      burnEffect = 0;
      floodEffect = 0;
      stunEffect = false;
      skipNextTurn = false;
      // Don't reset gameEnded here - keep it true until rematch is accepted
      
      // Re-enable draw button (will be disabled until opponent accepts)
      document.getElementById('draw-button').disabled = true;
      
      // Initialize hand with 3 cards
      for (let i = 0; i < 3; i++) {
        playerHand.push(getRandomCard());
      }
      
      // Update game state in Firestore to indicate rematch request
      const updates = {
        rematchRequestedBy: playerId,
        rematchAccepted: false,
        // Don't change gameActive here - keep it false until rematch is accepted
      };
      
      // Update player's hand based on which player they are
      if (playerId === data.player1Id) {
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
    }
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
  
  // Clear any active timer
  clearTurnTimer();
  
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
    playerHealth = 30;
    opponentHealth = 30;
    isPlayerTurn = false;
    gameEnded = false;
    currentRoom = null;
    opponentId = null;
    burnEffect = 0;
    floodEffect = 0;
    stunEffect = false;
    skipNextTurn = false;
    
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

// ADD THESE NEW FUNCTIONS - Put them anywhere in your JavaScript file (I recommend after the game constants section)

// Generate a short, unique room ID (6-character alphanumeric)
function generateRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing chars like 0, O, 1, I
  let roomId = '';
  for (let i = 0; i < 6; i++) {
    roomId += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return roomId;
}

// Check if room ID already exists
async function isRoomIdAvailable(roomId) {
  try {
    const roomRef = db.collection('rooms').doc(roomId);
    const doc = await roomRef.get();
    return !doc.exists;
  } catch (error) {
    console.error('Error checking room availability:', error);
    return false;
  }
}

// Generate unique room ID with collision checking
async function generateUniqueRoomId(maxAttempts = 10) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const roomId = generateRoomId();
    
    if (await isRoomIdAvailable(roomId)) {
      return roomId;
    }
  }
  
  // Fallback to timestamp-based ID if all attempts fail
  return `ROOM${Date.now().toString().slice(-6)}`;
}

// REPLACE YOUR EXISTING createRoom() FUNCTION WITH THIS:

// Create a new game room
async function createRoom() {
  try {
    // Reset game state
    gameEnded = false;
    playerHand = [];
    playerHealth = 30;
    opponentHealth = 30;
    burnEffect = 0;
    floodEffect = 0;
    stunEffect = false;
    skipNextTurn = false;
    
    // Generate a unique player ID
    playerId = `player_${Date.now()}_${Math.floor(Math.random()*1000)}`;
    
    // Generate a unique room ID (NEW - replaces Firestore auto-generation)
    const roomId = await generateUniqueRoomId();
    currentRoom = roomId;
    
    // Create room with custom ID instead of auto-generated (CHANGED)
    await db.collection('rooms').doc(roomId).set({
      createdAt: Date.now(),
      players: [playerId],
      gameActive: false,
      expired: false
    });
    
    // Create initial game state
    await db.collection('rooms').doc(currentRoom).collection('gameState').doc('current').set({
      player1Id: playerId,
      player2Id: null,
      currentTurn: null,
      player1Health: 30,
      player2Health: 30,
      player1Hand: [],
      player2Hand: [],
      lastPlayedCard: null,
      gameActive: false,
      winner: null,
      rematchRequestedBy: null,
      playerLeft: null,
      player1BurnEffect: 0,
      player1FloodEffect: 0,
      player1StunEffect: false,
      player1SkipTurn: false,
      player2BurnEffect: 0,
      player2FloodEffect: 0,
      player2StunEffect: false,
      player2SkipTurn: false
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
    
    showNotification(`Room Created! Share Room ID: ${currentRoom}`, "success", 7000);
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
  let roomId = roomIdInput.value.trim().toUpperCase(); // Convert to uppercase for consistency
  
  // Remove any spaces or special characters
  roomId = roomId.replace(/[^A-Z0-9]/g, '');
  
  if (!roomId) {
    // Highlight the input field if empty
    roomIdInput.classList.add('input-error');
    setTimeout(() => roomIdInput.classList.remove('input-error'), 1000);
    return;
  }
  
  // Update the input field to show cleaned room ID
  roomIdInput.value = roomId;
  
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
    playerHealth = 30;
    opponentHealth = 30;
    
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

// Additional helper function to handle turn transitions
function handleTurnChange() {
  if (!isPlayerTurn || gameEnded) return;
  
  // Process any effects at the start of turn
  const canTakeTurn = processTurnStart();
  
  // If player can take their turn, start the turn timer
  if (canTakeTurn) {
    // Check if there are time reductions from Ice element
    db.collection('rooms').doc(currentRoom).collection('gameState').doc('current')
      .get()
      .then(doc => {
        const data = doc.data();
        
        // Apply time reduction if present
        let timeReduction = 0;
        if (playerId === data.player1Id && data.player1TimeReduction) {
          timeReduction = data.player1TimeReduction;
          // Clear the reduction after applying it
          db.collection('rooms').doc(currentRoom).collection('gameState').doc('current')
            .update({ player1TimeReduction: 0 });
        } else if (playerId === data.player2Id && data.player2TimeReduction) {
          timeReduction = data.player2TimeReduction;
          // Clear the reduction after applying it
          db.collection('rooms').doc(currentRoom).collection('gameState').doc('current')
            .update({ player2TimeReduction: 0 });
        }
        
        // Adjust turn time limit based on Ice element effects
        turnTimeLimit = Math.max(10, 30 - timeReduction);
        
        // Start the timer
        startTurnTimer();
        
        // Update status effects display
        updateStatusEffectsDisplay();
      });
  }
}

// Subscribe to game state changes
function subscribeToGameState() {
  if (unsubscribe) {
    unsubscribe();
  }
  
  let wasPlayerTurn = isPlayerTurn;
  
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
      
      // Update player's turn status
      const previousTurnState = isPlayerTurn;
      isPlayerTurn = data.currentTurn === playerId;
      
      // Check if player's turn just started
      if (!previousTurnState && isPlayerTurn) {
        handleTurnChange();
      }
      
      // Load status effects
      if (playerId === data.player1Id) {
        burnEffect = data.player1BurnEffect || 0;
        floodEffect = data.player1FloodEffect || 0;
        stunEffect = data.player1StunEffect || false;
        skipNextTurn = data.player1SkipTurn || false;
      } else {
        burnEffect = data.player2BurnEffect || 0;
        floodEffect = data.player2FloodEffect || 0;
        stunEffect = data.player2StunEffect || false;
        skipNextTurn = data.player2SkipTurn || false;
      }
      
      // Check if opponent left the game
      if (data.playerLeft && data.playerLeft !== playerId) {
        showNotification("Opponent left the game!", "info", 5000);
        gameEnded = true;
        document.getElementById('draw-button').disabled = true;
        document.getElementById('game-controls').style.display = 'block';
      }
      
      // Handle rematch requests - show notification if opponent requested rematch
      if (data.rematchRequestedBy && data.rematchRequestedBy !== playerId && !data.rematchAccepted) {
        // Opponent requested a rematch and it's not yet accepted
        showNotification("Opponent wants a rematch! Click 'Play Again' to accept.", "info", 5000);
        // Show game controls so player can accept rematch
        document.getElementById('game-controls').style.display = 'block';
      }
      
      // Handle when rematch is accepted by both players
      if (data.rematchAccepted && !rematchAccepted) {
        // Local flag to track that we've processed this rematch
        rematchAccepted = true;
        
        // Reset game state
        gameEnded = false;
        document.getElementById('draw-button').disabled = false;
        document.getElementById('game-controls').style.display = 'none';
        
        // Clear play areas
        document.getElementById('play-area').innerHTML = 'No card played yet';
        document.getElementById('opponent-played-card').innerHTML = '';
        document.getElementById('effect-message').innerHTML = '';
        
        // Initialize player hand if needed
        if ((playerId === data.player1Id && (!data.player1Hand || data.player1Hand.length === 0)) ||
            (playerId === data.player2Id && (!data.player2Hand || data.player2Hand.length === 0))) {
          playerHand = [];
          for (let i = 0; i < 3; i++) {
            playerHand.push(getRandomCard());
          }
          
          // Update player hand in Firestore
          let updateObj = {};
          if (playerId === data.player1Id) {
            updateObj.player1Hand = playerHand;
          } else {
            updateObj.player2Hand = playerHand;
          }
          
          snapshot.ref.update(updateObj);
        } else {
          // Set hand from Firestore data
          if (playerId === data.player1Id && data.player1Hand) {
            playerHand = data.player1Hand;
          } else if (playerId === data.player2Id && data.player2Hand) {
            playerHand = data.player2Hand;
          }
        }
        
        showNotification("Game restarted! A new match begins.", "success");
        updateUI();
      }
      
      // Check if game is active
      if (!data.gameActive) {
        // Don't check rematchAccepted here, just focus on game activity status
        if (!gameEnded && data.player1Id && data.player2Id) {
          gameEnded = true;
          
          // If there's a winner defined
          if (data.winner !== null) {
            if (data.winner === playerId) {
              showNotification("You won!", "success", 5000);
            } else if (data.winner !== playerId && data.winner !== null) {
              showNotification("You lost!", "error", 5000);
            }
          } else if (playerHealth <= 0) {
			  // Explicit health check in case winner wasn't properly set
              showNotification("Game Over! You lost!", "error", 5000);
		  } else if (opponentHealth <= 0) {
			  // Explicit health check in case winner wasn't properly set
			  showNotification("Congratulations! You won!", "success", 5000);
		  }
          
          // Disable draw button
          document.getElementById('draw-button').disabled = true;
          
          // Show game controls
          document.getElementById('game-controls').style.display = 'block';
          
          // Reset rematch flags when game ends
          rematchAccepted = false;
        }
      }
      
      // Reset gameEnded flag if game becomes active again
      if (data.gameActive && gameEnded) {
        gameEnded = false;
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
      
      // Only enable draw button if it's player's turn and game is active
      document.getElementById('draw-button').disabled = !(isPlayerTurn && data.gameActive && !gameEnded);
      
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

// Also update the playCard function to prevent play during rematch request phase
function playCard(index) {
  if (!currentRoom || !isPlayerTurn || gameEnded) {
    if (gameEnded) {
      showNotification("Game already ended!", "info");
    } else if (!isPlayerTurn) {
      showNotification("Wait for your turn!", "info");
    }
    return;
  }
  
  // Prevent playing cards if rematch is requested but not yet accepted
  const gameStateRef = db.collection('rooms').doc(currentRoom).collection('gameState').doc('current');
  gameStateRef.get().then(doc => {
    const data = doc.data();
    
    if (data.rematchRequestedBy && !data.rematchAccepted) {
      showNotification("Cannot play - waiting for rematch confirmation!", "info");
      return;
    }
    
    // Original playCard functionality continues here
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
  }).catch(error => {
    console.error("Error checking game state:", error);
    showNotification("Error playing card. Please try again.", "error");
  });
}

// Initialize when page loads
window.onload = function() {
  initGame();
  
  // Set up a timer to clean up expired rooms every hour
  setInterval(cleanupExpiredRooms, 60 * 60 * 1000);
};