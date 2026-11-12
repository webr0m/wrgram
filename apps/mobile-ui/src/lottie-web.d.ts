declare module 'lottie-web' {
  export interface AnimationItem { destroy():void }
  const lottie:{loadAnimation(options:{container:Element;renderer:'svg';loop:boolean;autoplay:boolean;animationData:unknown}):AnimationItem};
  export default lottie;
}
declare module 'lottie-web/build/player/lottie_light' {
  export interface AnimationItem { destroy():void }
  const lottie:{loadAnimation(options:{container:Element;renderer:'svg';loop:boolean;autoplay:boolean;animationData:unknown}):AnimationItem};
  export default lottie;
}
