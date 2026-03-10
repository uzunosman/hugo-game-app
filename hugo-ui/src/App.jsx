import { useState, useEffect } from 'react'
import Login from './components/Login'
import Lobby from './components/Lobby'
import Room from './components/Room'
import socketService from './services/socketService'
import './assets/css/global.css';

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

  // --- TEST: Otomatik giriş, oda katılımı ve hazır olma ---
  // Bu blok test amaçlıdır, üretimde kaldırılacak.
  useEffect(() => {
    const randomName = `Player_${Math.floor(100 + Math.random() * 900)}`;

    socketService.connect();

    socketService.registerPlayer(randomName, (registerResponse) => {
      if (!registerResponse.success) return;

      const playerData = registerResponse.player;
      setPlayer(playerData);

      socketService.getRooms((roomsResponse) => {
        const rooms = roomsResponse?.rooms ?? [];
        if (rooms.length === 0) return;

        const firstRoom = rooms[0];

        socketService.joinRoom(firstRoom.id, (joinResponse) => {
          if (!joinResponse.success) return;

          setCurrentRoom(joinResponse.room);

          socketService.setReady(firstRoom.id, true, () => {});
        });
      });
    });
  }, []);
  // --- TEST SONU ---

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
