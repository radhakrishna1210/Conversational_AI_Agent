export type Category = "Marketing" | "Utility" | "Authentication";
export type TemplateType = "buttons" | "simple" | "checkout" | "carousel" | "catalog" | "form";
export type HeaderType = "None" | "Text" | "Image" | "Video" | "Document";

export interface UrlButton {
  id: string;
  urlType: "static" | "dynamic";
  url: string;
  buttonText: string;
}