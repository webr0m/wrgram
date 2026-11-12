package cc.webrom.wrgram;

import org.drinkless.tdlib.TdApi;

/** Texto plano de los mensajes con formato enriquecido (PageBlock/RichText) de Telegram. */
final class RichMessages {
    private RichMessages(){}

    static String summary(TdApi.MessageRichMessage content){
        if(content==null||content.message==null)return "";
        StringBuilder out=new StringBuilder();
        collect(content.message.blocks,out,0);
        String text=out.toString().replaceAll("\\s+"," ").trim();
        return text.length()>400?text.substring(0,400)+"…":text;
    }

    static String plain(TdApi.RichText text){
        if(text==null)return "";
        if(text instanceof TdApi.RichTextPlain)return value(((TdApi.RichTextPlain)text).text);
        if(text instanceof TdApi.RichTexts){StringBuilder out=new StringBuilder();TdApi.RichText[] parts=((TdApi.RichTexts)text).texts;if(parts!=null)for(TdApi.RichText part:parts)out.append(plain(part));return out.toString();}
        if(text instanceof TdApi.RichTextCustomEmoji){String alt=((TdApi.RichTextCustomEmoji)text).alternativeText;return alt==null||alt.isEmpty()?"✨":alt;}
        if(text instanceof TdApi.RichTextMathematicalExpression)return "$"+value(((TdApi.RichTextMathematicalExpression)text).expression)+"$";
        if(text instanceof TdApi.RichTextIcon)return "";
        if(text instanceof TdApi.RichTextDiff)return plain(((TdApi.RichTextDiff)text).text);
        if(text instanceof TdApi.RichTextButton){TdApi.InlineButton button=((TdApi.RichTextButton)text).button;return button==null?"":plain(button.text);}
        if(text instanceof TdApi.RichTextAnchor)return "";
        return plain(child(text));
    }

    private static TdApi.RichText child(TdApi.RichText text){
        if(text instanceof TdApi.RichTextBold)return ((TdApi.RichTextBold)text).text;
        if(text instanceof TdApi.RichTextItalic)return ((TdApi.RichTextItalic)text).text;
        if(text instanceof TdApi.RichTextUnderline)return ((TdApi.RichTextUnderline)text).text;
        if(text instanceof TdApi.RichTextStrikethrough)return ((TdApi.RichTextStrikethrough)text).text;
        if(text instanceof TdApi.RichTextSpoiler)return ((TdApi.RichTextSpoiler)text).text;
        if(text instanceof TdApi.RichTextSubscript)return ((TdApi.RichTextSubscript)text).text;
        if(text instanceof TdApi.RichTextSuperscript)return ((TdApi.RichTextSuperscript)text).text;
        if(text instanceof TdApi.RichTextMarked)return ((TdApi.RichTextMarked)text).text;
        if(text instanceof TdApi.RichTextFixed)return ((TdApi.RichTextFixed)text).text;
        if(text instanceof TdApi.RichTextDateTime)return ((TdApi.RichTextDateTime)text).text;
        if(text instanceof TdApi.RichTextMention)return ((TdApi.RichTextMention)text).text;
        if(text instanceof TdApi.RichTextHashtag)return ((TdApi.RichTextHashtag)text).text;
        if(text instanceof TdApi.RichTextCashtag)return ((TdApi.RichTextCashtag)text).text;
        if(text instanceof TdApi.RichTextBankCardNumber)return ((TdApi.RichTextBankCardNumber)text).text;
        if(text instanceof TdApi.RichTextTonAddress)return ((TdApi.RichTextTonAddress)text).text;
        if(text instanceof TdApi.RichTextBotCommand)return ((TdApi.RichTextBotCommand)text).text;
        if(text instanceof TdApi.RichTextMentionName)return ((TdApi.RichTextMentionName)text).text;
        if(text instanceof TdApi.RichTextUrl)return ((TdApi.RichTextUrl)text).text;
        if(text instanceof TdApi.RichTextEmailAddress)return ((TdApi.RichTextEmailAddress)text).text;
        if(text instanceof TdApi.RichTextPhoneNumber)return ((TdApi.RichTextPhoneNumber)text).text;
        if(text instanceof TdApi.RichTextReference)return ((TdApi.RichTextReference)text).text;
        if(text instanceof TdApi.RichTextReferenceLink)return ((TdApi.RichTextReferenceLink)text).text;
        if(text instanceof TdApi.RichTextAnchorLink)return ((TdApi.RichTextAnchorLink)text).text;
        return null;
    }

    private static void collect(TdApi.PageBlock[] blocks,StringBuilder out,int depth){
        if(blocks==null||depth>8)return;
        for(TdApi.PageBlock block:blocks)collect(block,out,depth);
    }

    private static void collect(TdApi.PageBlock block,StringBuilder out,int depth){
        if(block==null)return;
        if(block instanceof TdApi.PageBlockTitle)append(((TdApi.PageBlockTitle)block).title,out);
        else if(block instanceof TdApi.PageBlockSubtitle)append(((TdApi.PageBlockSubtitle)block).subtitle,out);
        else if(block instanceof TdApi.PageBlockHeader)append(((TdApi.PageBlockHeader)block).header,out);
        else if(block instanceof TdApi.PageBlockSubheader)append(((TdApi.PageBlockSubheader)block).subheader,out);
        else if(block instanceof TdApi.PageBlockSectionHeading)append(((TdApi.PageBlockSectionHeading)block).text,out);
        else if(block instanceof TdApi.PageBlockKicker)append(((TdApi.PageBlockKicker)block).kicker,out);
        else if(block instanceof TdApi.PageBlockParagraph)append(((TdApi.PageBlockParagraph)block).text,out);
        else if(block instanceof TdApi.PageBlockPreformatted)append(((TdApi.PageBlockPreformatted)block).text,out);
        else if(block instanceof TdApi.PageBlockFooter)append(((TdApi.PageBlockFooter)block).footer,out);
        else if(block instanceof TdApi.PageBlockThinking)append(((TdApi.PageBlockThinking)block).text,out);
        else if(block instanceof TdApi.PageBlockPullQuote)append(((TdApi.PageBlockPullQuote)block).text,out);
        else if(block instanceof TdApi.PageBlockExpandableBlockQuote)append(((TdApi.PageBlockExpandableBlockQuote)block).text,out);
        else if(block instanceof TdApi.PageBlockAuthorDate)append(((TdApi.PageBlockAuthorDate)block).author,out);
        else if(block instanceof TdApi.PageBlockBlockQuote)collect(((TdApi.PageBlockBlockQuote)block).blocks,out,depth+1);
        else if(block instanceof TdApi.PageBlockList){TdApi.PageBlockListItem[] items=((TdApi.PageBlockList)block).items;if(items!=null)for(TdApi.PageBlockListItem item:items)if(item!=null)collect(item.blocks,out,depth+1);}
        else if(block instanceof TdApi.PageBlockDetails)collect(((TdApi.PageBlockDetails)block).blocks,out,depth+1);
        else if(block instanceof TdApi.PageBlockCollage)collect(((TdApi.PageBlockCollage)block).blocks,out,depth+1);
        else if(block instanceof TdApi.PageBlockSlideshow)collect(((TdApi.PageBlockSlideshow)block).blocks,out,depth+1);
        else if(block instanceof TdApi.PageBlockEmbeddedPost)collect(((TdApi.PageBlockEmbeddedPost)block).blocks,out,depth+1);
        else if(block instanceof TdApi.PageBlockCover){TdApi.PageBlock inner=((TdApi.PageBlockCover)block).cover;collect(inner,out,depth+1);}
        else if(block instanceof TdApi.PageBlockChatLink){String title=((TdApi.PageBlockChatLink)block).title;if(title!=null&&!title.isBlank()){if(out.length()>0)out.append(' ');out.append(title);}}
        else if(block instanceof TdApi.PageBlockPhoto)append(((TdApi.PageBlockPhoto)block).caption,out);
        else if(block instanceof TdApi.PageBlockVideo)append(((TdApi.PageBlockVideo)block).caption,out);
        else if(block instanceof TdApi.PageBlockAnimation)append(((TdApi.PageBlockAnimation)block).caption,out);
        else if(block instanceof TdApi.PageBlockAudio)append(((TdApi.PageBlockAudio)block).caption,out);
        else if(block instanceof TdApi.PageBlockVoiceNote)append(((TdApi.PageBlockVoiceNote)block).caption,out);
        else if(block instanceof TdApi.PageBlockDocument)append(((TdApi.PageBlockDocument)block).caption,out);
        else if(block instanceof TdApi.PageBlockTable){TdApi.PageBlockTableCell[][] rows=((TdApi.PageBlockTable)block).cells;if(rows!=null)for(TdApi.PageBlockTableCell[] row:rows)if(row!=null)for(TdApi.PageBlockTableCell cell:row)if(cell!=null)append(cell.text,out);}
        else if(block instanceof TdApi.PageBlockMathematicalExpression)out.append(' ').append(value(((TdApi.PageBlockMathematicalExpression)block).expression));
    }

    private static void append(TdApi.PageBlockCaption caption,StringBuilder out){
        if(caption!=null)append(caption.text,out);
    }

    private static void append(TdApi.RichText text,StringBuilder out){
        String value=plain(text);
        if(value==null||value.isBlank())return;
        if(out.length()>0)out.append(' ');
        out.append(value);
    }

    private static String value(String text){return text==null?"":text;}
}
