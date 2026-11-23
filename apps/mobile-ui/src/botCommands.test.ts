import { describe, expect, it } from 'vitest';
import { botCommandEntities, commandQuery, insertCommand, matchingCommands, type BotCommand } from './botCommands';

const bot=(name:string,username='first_bot'):BotCommand=>({name,description:'Ayuda',botId:username,botName:username,username});

describe('comandos en el cuadro de mensajes',()=>{
  it('filtra al escribir barra, prefijo y destinatario, con selección de texto y URLs excluidas',()=>{
    expect(commandQuery('/',1)?.command).toBe('');
    expect(commandQuery('/he',3)?.command).toBe('he');
    expect(commandQuery('/help@second',12)?.username).toBe('second');
    expect(commandQuery('https://example.com/help',24)).toBeUndefined();
    expect(commandQuery('texto /he',9,6)).toBeUndefined();
    expect(commandQuery('/he',3,3,[{type:'code',offset:0,length:3}])).toBeUndefined();
    expect(matchingCommands([bot('help'),bot('help','second_bot'),bot('start')],commandQuery('/he@sec',7),true)).toEqual([bot('help','second_bot')]);
  });

  it('distingue los comandos iguales de bots distintos y descarta duplicados del mismo bot',()=>{
    expect(matchingCommands([bot('help'),bot('help'),bot('help','second_bot')],commandQuery('/',1),true)).toHaveLength(2);
    expect(matchingCommands([bot('help','')],undefined,true)).toEqual([]);
  });

  it('inserta el comando completo para el bot del grupo y conserva argumentos y formato',()=>{
    const value='🦆 /he argumentos';
    const query=commandQuery(value,6);
    const next=insertCommand(value,[{type:'bold',offset:7,length:10}],bot('help'),true,query);
    expect(next.text).toBe('🦆 /help@first_bot argumentos');
    expect(next.entities).toEqual([{type:'bold',offset:19,length:10}]);
    expect(next.caret).toBe(18);
  });

  it('reemplaza el token completo con el cursor en medio y mantiene un espacio al final',()=>{
    const next=insertCommand('/settings',[],bot('start'),false,commandQuery('/settings',4));
    expect(next.text).toBe('/start ');
    expect(next.caret).toBe(7);
  });

  it('anota las entidades en UTF-16, preserva formato y excluye código y enlaces',()=>{
    expect(botCommandEntities('🦆 /help@first_bot',[],true)).toEqual([{type:'botCommand',offset:3,length:15}]);
    expect(botCommandEntities('/help',[{type:'bold',offset:0,length:5}],true)).toEqual([
      {type:'bold',offset:0,length:5},{type:'botCommand',offset:0,length:5},
    ]);
    expect(botCommandEntities('/help',[{type:'code',offset:0,length:5}],true)).toEqual([{type:'code',offset:0,length:5}]);
    expect(botCommandEntities('/help',[{type:'botCommand',offset:0,length:5}],false)).toEqual([]);
    expect(botCommandEntities('https://example.com/help',[],true)).toEqual([]);
  });
});
