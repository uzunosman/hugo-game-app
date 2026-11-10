import { useState, useEffect } from 'react'
import Login from './components/Login'
import Lobby from './components/Lobby'
import Room from './components/Room'
import socketService from './services/socketService'
import './assets/css/global.css';
import './assets/css/components/Screens.css';

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

  // Sekmede kayıtlı oturum varsa (sayfa yenilendi) aynı oyuncu ve koltuğa dön
  const [restoring, setRestoring] = useState(() => !!socketService.savedPlayerId())

  useEffect(() => {
    socketService.connect()
    const savedId = socketService.savedPlayerId()
    if (!savedId) return
    socketService.reconnect(savedId, (response) => {
      if (response.success) {
        setPlayer(response.player)
        if (response.room) setCurrentRoom(response.room)
      }
      setRestoring(false)
    })
  }, [])

  if (restoring) {
    return <div className="screen"><p className="screen-note">Oturum geri yükleniyor…</p></div>
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
