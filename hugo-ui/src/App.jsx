import { useState } from 'react'
import Login from './components/Login'
import Lobby from './components/Lobby'
import Room from './components/Room'

function App() {
  const [player, setPlayer] = useState(null)
  const [currentRoom, setCurrentRoom] = useState(null)

  const handleLogin = (playerData) => {
    setPlayer(playerData)
  }

  const handleJoinRoom = (roomData) => {
    setCurrentRoom(roomData)
  }

  const handleLeaveRoom = () => {
    setCurrentRoom(null)
  }

  // Kullanıcı giriş yapmadıysa Login bileşenini göster
  if (!player) {
    return <Login onLogin={handleLogin} />
  }

  // Kullanıcı bir odada değilse Lobby bileşenini göster
  if (!currentRoom) {
    return <Lobby player={player} onJoinRoom={handleJoinRoom} />
  }

  // Kullanıcı bir odadaysa Room bileşenini göster
  return <Room player={player} room={currentRoom} onLeaveRoom={handleLeaveRoom} />
}

export default App
