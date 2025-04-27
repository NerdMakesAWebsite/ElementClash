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
}

// Draw a card and add it to the player's hand
function drawCard() {
  if (!currentRoom || !isPlayerTurn) return;
  
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
  if (!currentRoom || !isPlayerTurn) return;
  
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
  
  // End turn
  endTurn(card);
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
  checkGameOver();
  
  // Update the UI
  updateUI();
}

// End the current player's turn
function endTurn(playedCard) {
  if (!currentRoom) return;
  
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
    cardDiv.onclick = () => isPlayerTurn ? playCard(index) : alert("Wait for your turn!");
    handDiv.appendChild(cardDiv);
  });
}

// Check if the game is over
function checkGameOver() {
  if (playerHealth <= 0) {
    alert("Game Over! You lost!");
    resetGame();
    return true;
  } else if (opponentHealth <= 0) {
    alert("Congratulations! You won!");
    resetGame();
    return true;
  }
  return false;
}

// Reset the game
function resetGame() {
  playerHand = [];
  playerHealth = 20;
  opponentHealth = 20;
  isPlayerTurn = false;
  
  // If in a room, update game state
  if (currentRoom) {
    const gameStateRef = db.collection('rooms').doc(currentRoom).collection('gameState').doc('current');
    gameStateRef.update({
      gameActive: false,
      winner: playerHealth > 0 ? playerId : null
    });
  }
  
  updateUI();
}

// Create a new game room
async function createRoom() {
  try {
    // Generate a unique player ID
    playerId = `player_${Date.now()}_${Math.floor(Math.random()*1000)}`;
    
    // Create a new room in Firestore
    const roomRef = await db.collection('rooms').add({
      createdAt: Date.now(),
      players: [playerId],
      gameActive: false
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
      gameActive: false
    });
    
    // Subscribe to game state changes
    subscribeToGameState();
    
    // Show room ID
    document.getElementById('room-id-display').innerText = `Room ID: ${currentRoom}`;
    document.getElementById('waiting-message').style.display = 'block';
    document.getElementById('room-controls').style.display = 'none';
    
    alert(`Room Created! Share this Room ID with your opponent: ${currentRoom}`);
  } catch (error) {
    console.error("Error creating room:", error);
    alert("Error creating room. Please try again.");
  }
}

// Join an existing game room
async function joinExistingRoom() {
  const roomId = prompt("Enter Room ID:");
  if (!roomId) return;
  
  try {
    const roomRef = db.collection('rooms').doc(roomId);
    const roomSnap = await roomRef.get();
    
    if (!roomSnap.exists) {
      alert("Room not found!");
      return;
    }
    
    const roomData = roomSnap.data();
    
    // Check if room is full
    if (roomData.players.length >= 2) {
      alert("Room is full!");
      return;
    }
    
    // Generate a unique player ID
    playerId = `player_${Date.now()}_${Math.floor(Math.random()*1000)}`;
    
    // Add player to the room
    await roomRef.update({
      players: firebase.firestore.FieldValue.arrayUnion(playerId),
      gameActive: true
    });
    
    // Get game state reference
    const gameStateRef = db.collection('rooms').doc(roomId).collection('gameState').doc('current');
    const gameStateSnap = await gameStateRef.get();
    const gameStateData = gameStateSnap.data();
    
    // Update game state
    await gameStateRef.update({
      player2Id: playerId,
      currentTurn: gameStateData.player1Id, // First player starts
      gameActive: true
    });
    
    currentRoom = roomId;
    
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
    
    alert("Joined room successfully! Wait for your turn.");
  } catch (error) {
    console.error("Error joining room:", error);
    alert("Error joining room. Please try again.");
  }
}

// Subscribe to game state changes
function subscribeToGameState() {
  if (unsubscribe) {
    unsubscribe();
  }
  
  unsubscribe = db.collection('rooms').doc(currentRoom).collection('gameState').doc('current')
    .onSnapshot(snapshot => {
      const data = snapshot.data();
      
      // Check if game is active
      if (!data.gameActive) {
        if (data.winner) {
          alert(data.winner === playerId ? "You won!" : "You lost!");
        }
        resetGame();
        return;
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
      }
      
      // Update game state based on Firestore data
      if (playerId === data.player1Id) {
        playerHealth = data.player1Health;
        opponentHealth = data.player2Health;
        playerHand = data.player1Hand || [];
        isPlayerTurn = data.currentTurn === playerId;
      } else {
        playerHealth = data.player2Health;
        opponentHealth = data.player1Health;
        playerHand = data.player2Hand || [];
        isPlayerTurn = data.currentTurn === playerId;
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
      
      // Update UI
      updateUI();
    });
}

// Initialize the game
function initGame() {
  // Start with empty hand
  updateHand();
  
  // Initialize UI
  updateUI();
}

// Initialize when page loads
window.onload = initGame;