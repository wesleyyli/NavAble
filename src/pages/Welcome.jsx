import '../App.css';
import { speak } from '../App';
import background from '../Videos/welcome.mp4'
import logo from '../Assets/BlackNavableGlow.png'

function Welcome({setPage}) {

  return (
    <div className="App">
      <header className="overflow-hidden h-screen">
        <video height="100vh" autoPlay muted loop playsInline
        className="absolute top-0 left-0 w-full h-full object-cover">
            <source src={background} type="video/mp4"/>
            Your browser does not support the background video.
        </video>
        <div
            className="absolute top-0 left-0 w-full h-full object-cover bg-black animate-fadeOut">
        </div>
        <div className="absolute inset-0 flex flex-col items-center justify-center ">
            {/* <p className="text-[160px] font-bold text-black animate-slideIn">NavAble</p> */}
            <img className="w-3/5 animate-slideIn" src={logo} alt="Navable logo"></img>
            <button
            onClick={() => setPage("map")}
            className="w-2/5 h-1/6 font-display text-7xl p-2 rounded-3xl text-black animate-slideUp bg-white/70"
            type="button"
            >
            Start Mapping!
            </button>
        </div>
        
        

      </header>


    </div>
  );
}

export default Welcome;
