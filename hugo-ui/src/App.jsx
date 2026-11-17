import { useState, useEffect } from 'react'
import Lobby from './components/Lobby/Lobby'
import Room from './components/Room'
import socketService from './services/socketService'
import './assets/css/global.css';
import './assets/css/components/Screens.css';

function App() {
  const [player, setPlayer] = useState(null)
  const [currentRoom, setCurrentRoom] = useState(null)

  // Lobiye dönüş notu (örn. masa kapatıldı)
  const [notice, setNotice] = useState('')

  const handleJoinRoom = (roomData) => {
    setNotice('')
    setCurrentRoom(roomData)
  }

  // Masadan kalkınca sunucu yeni bir oyuncu kimliği verir (eski koltuk yapay zekâya geçer)
  const handleLeaveRoom = (newPlayer, message = '') => {
    if (newPlayer) setPlayer(newPlayer)
    setNotice(message)
    setCurrentRoom(null)
  }

  // Sekmede kayıtlı oturum varsa (sayfa yenilendi) aynı oyuncu ve koltuğa dön
  const [restoring, setRestoring] = useState(() => !!socketService.savedSession())
  // Bağlantı geri gelince artar: oda/oyun ekranı sunucudaki güncel durumla yeniden kurulur
  const [syncKey, setSyncKey] = useState(0)

  useEffect(() => {
    socketService.connect()
    socketService.onResync((response) => {
      if (response.success) {
        setPlayer(response.player)
        setCurrentRoom(response.room)
      } else {
        setPlayer(null)
        setCurrentRoom(null)
      }
      setSyncKey(k => k + 1)
    })
    const saved = socketService.savedSession()
    if (!saved) return
    socketService.reconnect(saved, (response) => {
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

  // İlk ekran lobi: masalar kayıt olmadan görünür, ad ve avatar masaya otururken sorulur
  if (!currentRoom) {
    return <Lobby key={syncKey} player={player} notice={notice} onRegister={setPlayer} onJoinRoom={handleJoinRoom} />
  }

  // Kullanıcı bir odadaysa Room bileşenini göster
  return <Room key={syncKey} player={player} room={currentRoom} onLeaveRoom={handleLeaveRoom} />
}

export default App
